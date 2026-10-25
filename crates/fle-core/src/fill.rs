//! 補完結果の確定。入力中の行に足りない要素を、テキストの修正(`Edit`)として返す。
//!
//! 補完した結果はログのテキストに書き込んで残す(開き直しても、再解釈しても同じになる)。
//! コアは時計を持たない。「いまの時刻」は呼び出し側から受け取る。
//!
//! 確定の範囲(`FillScope`)は、独立した指定:
//! - 時刻のない QSO 行の、行頭の時刻(`HHMM `)の挿入は、`no_clock` でなければ常に行う
//!   (「いま」はあとから再現できない)。`no_clock` は紙ログの打ち込み用で、その行は前の時刻を引き継ぐ。
//! - `expand_time`: 省略形の時刻(`15`、`115`)を、前の行から決まる `HHMM` に展開する。
//! - `band_mode`: 省略されたバンド・モードを、コールサインの前に挿入する。
//! - `rst`: 省略された RST を挿入し、省略形(`4` など)を解決した値に置き換える。
//! - `date`: いまの時刻を入れるとき、日付が変わっていれば行の前に `day +`(か `date`)を書く。
//! - `day_rollover`: 手で打った時刻が日をまたいだらしいとき(前が 21 時以降、この行が 3 時未満で前に戻る)、`day +` を書く。
//!
//! 利用者が書いたリファレンスやコメントは動かさない。
//!
//! 時刻の書式は、ログの `timezone` 指定に従う(なければ UTC)。

use chrono::{DateTime, Duration, NaiveDate};
use serde::{Deserialize, Serialize};

use crate::compiler::compile_fle;
use crate::ham::is_mhz;
use crate::line_info::is_day_rollover;
use crate::syntax::{parse_line, DirValue, LineKind, QsoItem, Rst, Span, Spanned};
use crate::types::FleQsoRecord;

/// テキストの一部を置き換える修正。位置は **UTF-16 の文字位置**(JS の文字列の添字)。
///
/// 返される修正は、渡したテキストに対する位置で、互いに重ならない。
/// 適用するときは、後ろの位置のものから順に行う。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Edit {
    pub from: usize,
    pub to: usize,
    pub insert: String,
}

/// 時刻の挿入に加えて、何を確定するか。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FillScope {
    /// 省略形の時刻(`15`、`115`)を `HHMM` に展開する
    pub expand_time: bool,
    /// 省略されたバンド・モードを書く
    pub band_mode: bool,
    /// 省略された RST を書き、省略形を解決した値に置き換える
    pub rst: bool,
    /// 時刻のない行に、いまの時刻を入れない(紙ログの打ち込み用)。その行は前の時刻を引き継ぐ
    pub no_clock: bool,
    /// いまの時刻を入れるとき、日付が変わっていれば、行の前に `day +` か `date` を書く(`date` がまだないときも)
    pub date: bool,
    /// 手で打った時刻の行が、日をまたいだらしいとき(前の QSO がログの時刻で 21 時以降、この行が 3 時未満で
    /// 前に戻っている)、行の前に `day +` を書く。それ以外の戻りは、推測せず、そのままにする
    pub day_rollover: bool,
}

impl FillScope {
    /// 時刻の挿入だけ(Enter)
    pub const TIME: Self = Self {
        expand_time: false,
        band_mode: false,
        rst: false,
        no_clock: false,
        date: false,
        day_rollover: false,
    };
    /// すべて
    pub const FULL: Self = Self {
        expand_time: true,
        band_mode: true,
        rst: true,
        no_clock: false,
        date: false,
        day_rollover: false,
    };

    /// QSOの解釈結果(コンパイルの結果)が要るか
    fn needs_record(self) -> bool {
        self.expand_time || self.band_mode || self.rst || self.day_rollover
    }
}

/// 時刻の挿入だけを行う。`fill_with(.., FillScope::TIME)` と同じ。
pub fn fill(text: &str, line: usize, now_ms: i64, default_tz: i32) -> Vec<Edit> {
    fill_with(text, line, now_ms, default_tz, FillScope::TIME)
}

/// `line`(0始まり)の行を確定する。直すところがなければ空を返す。適用した後に再び呼んでも、
/// 空になる(冪等)。
///
/// - `now_ms`: いまの時刻(UNIX時刻のミリ秒。UTC)
/// - `default_tz`: 設定の既定のタイムゾーン(UTCからの時間差。UTC は 0)
pub fn fill_with(
    text: &str,
    line: usize,
    now_ms: i64,
    default_tz: i32,
    scope: FillScope,
) -> Vec<Edit> {
    let lines: Vec<&str> = text.split('\n').collect();
    let Some(target) = lines.get(line) else {
        return Vec::new();
    };
    let LineKind::Qso(items) = parse_line(target).kind else {
        return Vec::new();
    };
    let Some(shape) = QsoShape::of(&items) else {
        return Vec::new();
    };

    // 位置の換算: 行内の位置(UTF-16)→ テキスト全体の位置
    let line_start = line_start_utf16(&lines, line);
    let base = line_start + leading_spaces_utf16(target);
    let abs = |(from, to): Span| (line_start + from, line_start + to);

    // 時刻の意味(タイムゾーン)は、ログで最初に決まったものに従う
    let before_tz = timezone_before(&lines[..line]);

    // 解釈の結果が要る確定: エラーのある行や、解釈できない行は、何も変えない
    let (record, prev_record) = if scope.needs_record() {
        let compiled = compile_fle(text);
        if compiled.errors.iter().any(|e| e.line == line) {
            return Vec::new();
        }
        let prev = compiled
            .records
            .iter()
            .rev()
            .find(|r| r.line < line)
            .cloned();
        match compiled.records.into_iter().find(|r| r.line == line) {
            Some(r) => (Some(r), prev),
            None => return Vec::new(),
        }
    } else {
        (None, None)
    };

    // (位置, 同じ位置に入れるときの順序, 修正)。同じ位置の挿入は、順序どおりに1つへまとめる
    let mut parts: Vec<(usize, u8, Edit)> = Vec::new();

    // --- 時刻 ---
    match shape.time {
        None if scope.no_clock => {}
        None => {
            let Some(now) = DateTime::from_timestamp_millis(now_ms) else {
                return Vec::new();
            };
            let (tz, tz_line) = match before_tz {
                Some(tz) => (tz, None),
                None if default_tz != 0 && !has_qso_before(text, line) => {
                    (default_tz, Some(format!("timezone {:+}\n", default_tz)))
                }
                None => (0, None),
            };
            if let Some(tz_line) = tz_line {
                parts.push((0, 0, insert_at(0, tz_line)));
            }
            let local = now + Duration::hours(i64::from(tz));
            // 日付が変わっていたら、QSO の行の前に書く(いまの時計で決めるので、推測しない)。
            // 翌日なら `day +`、もっと離れていたり、`date` がまだなければ `date`
            if let Some(dir) = scope
                .date
                .then(|| date_directive(text, line, local.date_naive()))
                .flatten()
            {
                parts.push((line_start, 0, insert_at(line_start, dir)));
            }
            let hhmm = local.format("%H%M");
            parts.push((base, 1, insert_at(base, format!("{hhmm} "))));
        }
        Some(i) => {
            // 日をまたいだらしい(2358 のあとの 0002 など)なら、`day +` を書く。ほかの戻りは推測しない
            if let (true, Some(rec), Some(prev)) =
                (scope.day_rollover, record.as_ref(), prev_record.as_ref())
            {
                if is_day_rollover(prev, rec) {
                    parts.push((line_start, 0, insert_at(line_start, "day +\n".to_string())));
                }
            }
            // 省略形(分だけ・H:MM)は、指定があるときだけ HHMM に展開する
            if let (true, Some(rec), QsoItem::Time { digits, .. }) =
                (scope.expand_time, record.as_ref(), &items[i].node)
            {
                if *digits < 4 {
                    let hhmm = local_hhmm(rec, before_tz.unwrap_or(0));
                    if let Some(hhmm) = hhmm {
                        let (from, to) = abs(items[i].span);
                        parts.push((
                            from,
                            1,
                            Edit {
                                from,
                                to,
                                insert: hhmm,
                            },
                        ));
                    }
                }
            }
        }
    }

    if let Some(rec) = record.as_ref() {
        // --- バンド・モード(コールサインの前に置く。RSTの既定値の判定にも使われる位置) ---
        let mut front = String::new();
        if scope.band_mode && !shape.has_band {
            // 周波数で指定されているログでは、バンドを入れると周波数が既定値に戻ってしまうので、
            // 周波数そのものを入れる(バンドで指定されているなら、バンドを入れる)
            if is_mhz(&rec.freq) {
                front.push_str(&format!("{} ", rec.freq));
            } else if !rec.band.is_empty() {
                front.push_str(&format!("{} ", rec.band));
            }
        }
        if scope.band_mode && !shape.has_mode && !rec.mode.is_empty() {
            front.push_str(&format!("{} ", rec.mode));
        }
        if !front.is_empty() {
            let at = abs(items[shape.call].span).0;
            parts.push((at, 2, insert_at(at, front)));
        }

        // --- RST(コールサインの直後の2つ) ---
        let (sent, rcvd) = (&rec.rst_sent, &rec.rst_rcvd);
        let mut last_end = abs(items[shape.call].span).1;
        let rst_slots = if scope.rst { shape.rst.as_slice() } else { &[] };
        for (slot, value) in rst_slots.iter().zip([sent, rcvd]) {
            match slot {
                Some(rst) => {
                    let (from, to) = abs(rst.span);
                    if rst_text(&rst.node) != value {
                        parts.push((
                            from,
                            3,
                            Edit {
                                from,
                                to,
                                insert: value.clone(),
                            },
                        ));
                    }
                    last_end = to;
                }
                None => {
                    parts.push((last_end, 3, insert_at(last_end, format!(" {value}"))));
                }
            }
        }
    }

    merge(parts)
}

/// 時刻を自動で入れる行の前に書く、日付の指令(改行付き)。日付がそのままなら None。
/// 基準日付より前(先の日付を書いておいた予定のログなど)は、書き換えない
fn date_directive(text: &str, line: usize, today: NaiveDate) -> Option<String> {
    let info = crate::line_info::line_info(text, line);
    if info.date.is_empty() {
        return Some(format!("date {}\n", today.format("%Y-%m-%d")));
    }
    let base = NaiveDate::parse_from_str(&info.date, "%Y-%m-%d").ok()?;
    match (today - base).num_days() {
        1 => Some("day +\n".to_string()),
        d if d >= 2 => Some(format!("date {}\n", today.format("%Y-%m-%d"))),
        _ => None,
    }
}

fn insert_at(at: usize, insert: String) -> Edit {
    Edit {
        from: at,
        to: at,
        insert,
    }
}

/// 同じ位置への挿入を、順序どおりに1つの修正へまとめて、位置の昇順で返す
fn merge(mut parts: Vec<(usize, u8, Edit)>) -> Vec<Edit> {
    parts.sort_by_key(|(at, order, _)| (*at, *order));
    let mut out: Vec<Edit> = Vec::new();
    for (_, _, e) in parts {
        match out.last_mut() {
            Some(last) if last.from == e.from && last.to == last.from && e.to == e.from => {
                last.insert.push_str(&e.insert);
            }
            _ => out.push(e),
        }
    }
    out
}

fn rst_text(rst: &Rst) -> &str {
    match rst {
        Rst::Digits { value, .. } | Rst::Snr(value) => value,
    }
}

/// QSO行の構造: どの要素がコールサイン・時刻・RSTか
struct QsoShape {
    /// コールサインの要素の番号
    call: usize,
    /// 時刻(数値)の要素の番号。なければ時刻を省いた行
    time: Option<usize>,
    has_band: bool,
    has_mode: bool,
    /// コールサイン直後の、送信・受信のRST(あれば)
    rst: [Option<Spanned<Rst>>; 2],
}

impl QsoShape {
    /// コールサインを含み、その前が 時刻/バンド/周波数/モード/コメント だけの行
    fn of(items: &[Spanned<QsoItem>]) -> Option<Self> {
        let call = items
            .iter()
            .position(|it| matches!(it.node, QsoItem::Call { .. }))?;
        let mut time = None;
        for (i, it) in items[..call].iter().enumerate() {
            match it.node {
                QsoItem::Time { .. } if time.is_none() => time = Some(i),
                QsoItem::Band { .. }
                | QsoItem::Freq(_)
                | QsoItem::Mode(_)
                | QsoItem::Comment { .. } => {}
                _ => return None,
            }
        }
        let has_band = items
            .iter()
            .any(|it| matches!(it.node, QsoItem::Band { .. } | QsoItem::Freq(_)));
        let has_mode = items.iter().any(|it| matches!(it.node, QsoItem::Mode(_)));
        let QsoItem::Call {
            rst_sent, rst_rcvd, ..
        } = &items[call].node
        else {
            return None;
        };
        Some(Self {
            call,
            time,
            has_band,
            has_mode,
            rst: [rst_sent.clone(), rst_rcvd.clone()],
        })
    }
}

/// QSOの時刻(UTC)を、ログのタイムゾーンでの `HHMM` にする
fn local_hhmm(rec: &FleQsoRecord, tz: i32) -> Option<String> {
    let utc = NaiveDate::from_ymd_opt(
        i32::from(rec.year),
        u32::from(rec.month),
        u32::from(rec.day),
    )?
    .and_hms_opt(u32::from(rec.hour), u32::from(rec.min), 0)?;
    Some(
        (utc + Duration::hours(i64::from(tz)))
            .format("%H%M")
            .to_string(),
    )
}

/// この行より前で、最後に有効になっている `timezone` 指定
fn timezone_before(lines: &[&str]) -> Option<i32> {
    lines.iter().rev().find_map(|l| match parse_line(l).kind {
        LineKind::Directive(d) => match d.value {
            Some(DirValue::Timezone(tz)) => Some(tz),
            _ => None,
        },
        _ => None,
    })
}

fn has_qso_before(text: &str, line: usize) -> bool {
    compile_fle(text).records.iter().any(|r| r.line < line)
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// 行の先頭の、テキスト全体での位置(UTF-16)。行の区切り `\n` の分も数える。
fn line_start_utf16(lines: &[&str], line: usize) -> usize {
    lines[..line].iter().map(|l| utf16_len(l) + 1).sum()
}

fn leading_spaces_utf16(line: &str) -> usize {
    utf16_len(&line[..line.len() - line.trim_start().len()])
}

/// 修正を、後ろの位置のものから順に適用する(UTF-16の位置で)
pub fn apply_edits(text: &str, edits: &[Edit]) -> String {
    let mut units: Vec<u16> = text.encode_utf16().collect();
    let mut sorted: Vec<&Edit> = edits.iter().collect();
    sorted.sort_by_key(|e| std::cmp::Reverse(e.from));
    for e in sorted {
        units.splice(e.from..e.to, e.insert.encode_utf16());
    }
    String::from_utf16_lossy(&units)
}

/// QSO の行で、直すために選ぶ要素(候補バーで押したもの)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Part {
    Call,
    Time,
    /// 受信の RST(相手からもらった方)
    RstRcvd,
    /// 送信の RST
    RstSent,
}

/// 要素を選ぶための修正と、選ぶ範囲。範囲は、修正を適用した後のテキストでの位置(UTF-16)
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Selection {
    pub edits: Vec<Edit>,
    pub from: usize,
    pub to: usize,
}

/// `line` の QSO の行で、`part` の範囲を返す。行に書かれていなければ、書き込む修正もつける
/// (RST は既定値、時刻はいまの時刻。`no_clock` なら、前から引き継いだ時刻)。
/// 解釈できない行・誤りのある行は None。
pub fn select_part(
    text: &str,
    line: usize,
    part: Part,
    now_ms: i64,
    default_tz: i32,
    no_clock: bool,
) -> Option<Selection> {
    let edits = match (part, find_part(text, line, part)) {
        (_, Some(_)) => Vec::new(),
        (Part::Call, None) => return None,
        (Part::Time, None) if !no_clock => {
            fill_with(text, line, now_ms, default_tz, FillScope::TIME)
        }
        (Part::Time, None) => {
            let lines: Vec<&str> = text.split('\n').collect();
            let compiled = compile_fle(text);
            if compiled.errors.iter().any(|e| e.line == line) {
                return None;
            }
            let rec = compiled.records.iter().find(|r| r.line == line)?;
            let hhmm = local_hhmm(rec, timezone_before(&lines[..line]).unwrap_or(0))?;
            let at = line_start_utf16(&lines, line) + leading_spaces_utf16(lines[line]);
            vec![insert_at(at, format!("{hhmm} "))]
        }
        (Part::RstRcvd | Part::RstSent, None) => {
            let scope = FillScope {
                rst: true,
                no_clock: true,
                ..FillScope::TIME
            };
            fill_with(text, line, now_ms, default_tz, scope)
        }
    };
    if edits.is_empty() && find_part(text, line, part).is_none() {
        return None;
    }
    let after = apply_edits(text, &edits);
    // 先頭に timezone の行が入ると、行がずれる
    let shift = after.split('\n').count() - text.split('\n').count();
    let (from, to) = find_part(&after, line + shift, part)?;
    Some(Selection { edits, from, to })
}

/// `line` の QSO の行での、`part` の範囲(テキスト全体での UTF-16 の位置)
fn find_part(text: &str, line: usize, part: Part) -> Option<Span> {
    let lines: Vec<&str> = text.split('\n').collect();
    let LineKind::Qso(items) = parse_line(lines.get(line)?).kind else {
        return None;
    };
    let shape = QsoShape::of(&items)?;
    let (from, to) = match part {
        Part::Call => items[shape.call].span,
        Part::Time => items[shape.time?].span,
        Part::RstSent => shape.rst[0].as_ref()?.span,
        Part::RstRcvd => shape.rst[1].as_ref()?.span,
    };
    let start = line_start_utf16(&lines, line);
    Some((start + from, start + to))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 2026-10-18T09:05:30Z
    const NOW: i64 = 1_792_314_330_000;

    fn edit(from: usize, insert: &str) -> Edit {
        Edit {
            from,
            to: from,
            insert: insert.to_string(),
        }
    }

    fn apply(text: &str, edits: &[Edit]) -> String {
        apply_edits(text, edits)
    }

    #[test]
    fn inserts_the_current_time_in_utc_at_the_line_start() {
        let edits = fill("mycall JA1ABC\nja1xyz", 1, NOW, 0);
        assert_eq!(edits, vec![edit(14, "0905 ")]);
    }

    #[test]
    fn leaves_a_line_that_already_has_a_time() {
        assert!(fill("0900 ja1xyz", 0, NOW, 0).is_empty());
        assert!(fill("4 ja4qru", 0, NOW, 0).is_empty()); // 分だけの省略形
    }

    #[test]
    fn leaves_lines_that_are_not_qsos() {
        let text = "mycall JA1ABC\n40m cw\n\nday +\nssb";
        for line in 0..5 {
            assert!(fill(text, line, NOW, 0).is_empty(), "line {line}");
        }
    }

    #[test]
    fn ignores_a_line_that_does_not_exist() {
        assert!(fill("ja1xyz", 5, NOW, 0).is_empty());
    }

    #[test]
    fn follows_the_timezone_directive_in_the_log() {
        let edits = fill("timezone +9\nja1xyz", 1, NOW, 0);
        assert_eq!(edits, vec![edit(12, "1805 ")]);
    }

    #[test]
    fn the_log_directive_wins_over_the_default_timezone() {
        let edits = fill("timezone -5\nja1xyz", 1, NOW, 9);
        assert_eq!(edits, vec![edit(12, "0405 ")]);
    }

    #[test]
    fn writes_the_timezone_line_when_the_default_is_not_utc() {
        let text = "mycall JA1ABC\nja1xyz";
        let edits = fill(text, 1, NOW, 9);
        assert_eq!(edits, vec![edit(0, "timezone +9\n"), edit(14, "1805 ")]);
        assert_eq!(
            apply(text, &edits),
            "timezone +9\nmycall JA1ABC\n1805 ja1xyz"
        );
    }

    #[test]
    fn negative_timezone_is_written_with_its_sign() {
        let edits = fill("ja1xyz", 0, NOW, -5);
        assert_eq!(edits, vec![edit(0, "timezone -5\n0405 ")]);
    }

    #[test]
    fn merges_into_one_edit_at_the_very_start_of_the_text() {
        let edits = fill("ja1xyz", 0, NOW, 9);
        assert_eq!(edits, vec![edit(0, "timezone +9\n1805 ")]);
    }

    #[test]
    fn keeps_utc_when_earlier_qsos_already_exist_without_a_timezone() {
        // それまでの時刻はUTCの意味で書かれている。途中でゾーンを変えない
        let text = "mycall JA1ABC\n40m cw\n0900 ja1qso\nja1xyz";
        let edits = fill(text, 3, NOW, 9);
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].insert, "0905 ");
    }

    #[test]
    fn wraps_over_midnight_with_the_zone_offset() {
        // 20:30Z + 9h = 翌 05:30
        let now = NOW + (11 * 3600 + 24 * 60 + 30) * 1000; // 20:30:00Z
        assert_eq!(fill("timezone +9\nja1xyz", 1, now, 0)[0].insert, "0530 ");
    }

    #[test]
    fn positions_count_utf16_units_for_japanese_and_emoji() {
        // 日本語は1文字=1単位、絵文字は2単位
        assert_eq!(fill("コメント\nja1xyz", 1, NOW, 0), vec![edit(5, "0905 ")]);
        assert_eq!(fill("😀\nja1xyz", 1, NOW, 0), vec![edit(3, "0905 ")]);
    }

    #[test]
    fn inserts_after_leading_spaces() {
        assert_eq!(fill("  ja1xyz", 0, NOW, 0), vec![edit(2, "0905 ")]);
    }

    #[test]
    fn crlf_does_not_shift_positions() {
        // `\r` は前の行の一部として数える(JSの文字列もそう)
        let text = "mycall JA1ABC\r\nja1xyz";
        let edits = fill(text, 1, NOW, 0);
        assert_eq!(edits, vec![edit(15, "0905 ")]);
        assert_eq!(apply(text, &edits), "mycall JA1ABC\r\n0905 ja1xyz");
    }

    #[test]
    fn is_idempotent() {
        for default_tz in [0, 9, -5] {
            let text = "mycall JA1ABC\nja1xyz";
            let once = apply(text, &fill(text, 1, NOW, default_tz));
            let line = once.split('\n').count() - 1;
            assert!(
                fill(&once, line, NOW, default_tz).is_empty(),
                "tz {default_tz}: {once:?}"
            );
        }
    }

    #[test]
    fn an_invalid_time_returns_nothing() {
        assert!(fill("ja1xyz", 0, i64::MAX, 0).is_empty());
    }

    #[test]
    fn serializes_with_plain_field_names() {
        let json = serde_json::to_value(fill("ja1xyz", 0, NOW, 0)).unwrap();
        assert_eq!(json[0]["from"], 0);
        assert_eq!(json[0]["to"], 0);
        assert_eq!(json[0]["insert"], "0905 ");
    }

    // ---- いまの時刻を入れない(紙ログの打ち込み) ----

    #[test]
    fn no_clock_leaves_the_line_without_a_time() {
        let scope = FillScope {
            no_clock: true,
            ..FillScope::TIME
        };
        assert!(fill_with("40m cw\nja1xyz", 1, NOW, 0, scope).is_empty());
        // 既定のタイムゾーンの行も書かない(時刻を入れないので要らない)
        assert!(fill_with("40m cw\nja1xyz", 1, NOW, 9, scope).is_empty());
    }

    #[test]
    fn no_clock_still_writes_band_mode_and_rst_and_expands_shorthand() {
        let scope = FillScope {
            no_clock: true,
            ..FillScope::FULL
        };
        let text = "mycall JA1ABC\ndate 2026-10-18\n40m cw\n1000 ja1aaa\nja1xyz\n5 ja1qqq";
        let once = apply(text, &fill_with(text, 4, NOW, 0, scope));
        assert!(
            once.ends_with("\n40m CW ja1xyz 599 599\n5 ja1qqq"),
            "{once}"
        );
        let twice = apply(&once, &fill_with(&once, 5, NOW, 0, scope));
        assert!(twice.ends_with("\n1005 40m CW ja1qqq 599 599"), "{twice}");
    }

    // ---- 候補バーで要素を選ぶ ----

    /// 選んだ後のテキストと、選んだ文字
    fn pick(text: &str, line: usize, part: Part, no_clock: bool) -> (String, String) {
        let sel = select_part(text, line, part, NOW, 0, no_clock).expect("selection");
        let after = apply(text, &sel.edits);
        let units: Vec<u16> = after.encode_utf16().collect();
        let picked = String::from_utf16(&units[sel.from..sel.to]).unwrap();
        (after, picked)
    }

    const LOG: &str = "mycall JA1ABC\ndate 2026-10-18\n40m cw\n1000 ja1aaa\n";

    #[test]
    fn selects_what_is_written() {
        let text = format!("{LOG}5 ja1xyz 579 449 <hi>");
        assert_eq!(
            pick(&text, 4, Part::Call, false),
            (text.clone(), "ja1xyz".into())
        );
        assert_eq!(pick(&text, 4, Part::Time, false).1, "5");
        assert_eq!(pick(&text, 4, Part::RstSent, false).1, "579");
        assert_eq!(pick(&text, 4, Part::RstRcvd, false).1, "449");
    }

    #[test]
    fn writes_the_default_rst_then_selects_it() {
        let text = format!("{LOG}0905 ja1xyz");
        let (after, picked) = pick(&text, 4, Part::RstRcvd, false);
        assert_eq!(
            (after.as_str(), picked.as_str()),
            (format!("{LOG}0905 ja1xyz 599 599").as_str(), "599")
        );
        let sel = select_part(&text, 4, Part::RstRcvd, NOW, 0, false).unwrap();
        assert!(
            after.encode_utf16().count() == sel.to,
            "受信の方(後ろ)を選ぶ"
        );
        // 送信だけ書いてあれば、受信を足す(CW の2桁の省略形は、9 を補った値に)
        let text = format!("{LOG}0905 ja1xyz 57");
        assert_eq!(
            pick(&text, 4, Part::RstRcvd, false).0,
            format!("{LOG}0905 ja1xyz 579 599")
        );
    }

    #[test]
    fn writes_the_time_then_selects_it() {
        let text = format!("{LOG}ja1xyz");
        assert_eq!(
            pick(&text, 4, Part::Time, false),
            (format!("{LOG}0905 ja1xyz"), "0905".into())
        );
        // いまの時刻を入れない設定では、前から引き継いだ時刻を書く
        assert_eq!(
            pick(&text, 4, Part::Time, true),
            (format!("{LOG}1000 ja1xyz"), "1000".into())
        );
    }

    #[test]
    fn follows_the_shift_of_a_timezone_line() {
        let text = "mycall JA1ABC\nja1xyz";
        let sel = select_part(text, 1, Part::Time, NOW, 9, false).unwrap();
        let after = apply(text, &sel.edits);
        assert_eq!(after, "timezone +9\nmycall JA1ABC\n1805 ja1xyz");
        let units: Vec<u16> = after.encode_utf16().collect();
        assert_eq!(
            String::from_utf16(&units[sel.from..sel.to]).unwrap(),
            "1805"
        );
    }

    #[test]
    fn nothing_to_select_on_a_line_that_is_not_a_qso() {
        assert!(select_part(LOG, 2, Part::Call, NOW, 0, false).is_none());
        assert!(select_part(LOG, 0, Part::RstRcvd, NOW, 0, false).is_none());
    }

    // ---- 日付(時刻を自動で入れるとき) ----

    fn with_date(text: &str, line: usize, now_ms: i64, tz: i32) -> String {
        let scope = FillScope {
            date: true,
            ..FillScope::TIME
        };
        apply(text, &fill_with(text, line, now_ms, tz, scope))
    }

    // NOW は 2026-10-18 09:05 UTC

    #[test]
    fn writes_day_plus_when_the_date_has_moved_to_the_next_day() {
        let text = "date 2026-10-17\n2359 ja1aaa\njh1hhh";
        assert_eq!(
            with_date(text, 2, NOW, 0),
            "date 2026-10-17\n2359 ja1aaa\nday +\n0905 jh1hhh"
        );
        // 書いたあとは、もう書かない(冪等)
        let done = "date 2026-10-17\n2359 ja1aaa\nday +\n0905 jh1hhh";
        assert_eq!(
            fill_with(
                done,
                3,
                NOW,
                0,
                FillScope {
                    date: true,
                    ..FillScope::TIME
                }
            ),
            vec![]
        );
    }

    #[test]
    fn writes_nothing_on_the_same_day() {
        let text = "date 2026-10-18\n0900 ja1aaa\njh1hhh";
        assert_eq!(
            with_date(text, 2, NOW, 0),
            "date 2026-10-18\n0900 ja1aaa\n0905 jh1hhh"
        );
    }

    #[test]
    fn writes_the_date_when_days_have_passed_or_there_is_no_date() {
        let text = "date 2026-10-15\n0900 ja1aaa\njh1hhh";
        assert_eq!(
            with_date(text, 2, NOW, 0),
            "date 2026-10-15\n0900 ja1aaa\ndate 2026-10-18\n0905 jh1hhh"
        );
        assert_eq!(
            with_date("mycall JA1ABC\nja1aaa", 1, NOW, 0),
            "mycall JA1ABC\ndate 2026-10-18\n0905 ja1aaa"
        );
    }

    #[test]
    fn leaves_a_date_set_ahead_for_a_planned_log() {
        let text = "date 2026-10-20\nja1aaa";
        assert_eq!(with_date(text, 1, NOW, 0), "date 2026-10-20\n0905 ja1aaa");
    }

    #[test]
    fn the_date_follows_the_timezone_of_the_log() {
        // 2026-10-18 15:05 UTC は、JST では 10-19 00:05。JST のログなら翌日、UTC のログなら同じ日
        let late = NOW + 6 * 3_600_000;
        let jst = "timezone +9\ndate 2026-10-18\n2350 ja1aaa\njh1hhh";
        assert_eq!(
            with_date(jst, 3, late, 0),
            "timezone +9\ndate 2026-10-18\n2350 ja1aaa\nday +\n0005 jh1hhh"
        );
        let utc = "date 2026-10-18\n1500 ja1aaa\njh1hhh";
        assert_eq!(
            with_date(utc, 2, late, 0),
            "date 2026-10-18\n1500 ja1aaa\n1505 jh1hhh"
        );
    }

    #[test]
    fn writes_the_date_after_a_new_timezone_line() {
        assert_eq!(
            with_date("ja1aaa", 0, NOW, 9),
            "timezone +9\ndate 2026-10-18\n1805 ja1aaa"
        );
    }

    #[test]
    fn a_time_written_by_hand_is_left_alone() {
        let text = "date 2026-10-17\n2359 ja1aaa\n0001 jh1hhh";
        assert_eq!(with_date(text, 2, NOW, 0), text);
    }

    // ---- Full(確定ボタン) ----

    fn full(text: &str, line: usize, tz: i32) -> Vec<Edit> {
        fill_with(text, line, NOW, tz, FillScope::FULL)
    }

    #[test]
    fn full_writes_time_band_mode_and_rst_into_the_line() {
        let text = "mycall JA1ABC\n40m cw\nja1xyz";
        let edits = full(text, 2, 0);
        assert_eq!(
            apply(text, &edits),
            "mycall JA1ABC\n40m cw\n0905 40m CW ja1xyz 599 599"
        );
    }

    #[test]
    fn full_uses_the_default_rst_of_the_mode() {
        let ssb = "mycall JA1ABC\n40m ssb\nja1xyz";
        assert_eq!(
            apply(ssb, &full(ssb, 2, 0)),
            "mycall JA1ABC\n40m ssb\n0905 40m SSB ja1xyz 59 59"
        );
        let ft8 = "mycall JA1ABC\n20m ft8\nja1xyz";
        assert_eq!(
            apply(ft8, &full(ft8, 2, 0)),
            "mycall JA1ABC\n20m ft8\n0905 20m FT8 ja1xyz -10 -10"
        );
    }

    #[test]
    fn full_adds_only_what_is_missing() {
        // 時刻・RSTは書いてある。バンドとモードだけを足す
        let text = "40m cw\n0900 ja1xyz 579 599";
        assert_eq!(
            apply(text, &full(text, 1, 0)),
            "40m cw\n0900 40m CW ja1xyz 579 599"
        );
    }

    #[test]
    fn full_completes_a_missing_received_rst() {
        let text = "40m cw\n0900 40m CW ja1xyz 559";
        assert_eq!(
            apply(text, &full(text, 1, 0)),
            "40m cw\n0900 40m CW ja1xyz 559 599"
        );
    }

    #[test]
    fn full_expands_single_digit_rst_shorthand() {
        // 「4」は 549、「6 7」は 569 579(FLEの省略形)
        let one = "40m cw\n0900 40m CW ja1xyz 4";
        assert_eq!(
            apply(one, &full(one, 1, 0)),
            "40m cw\n0900 40m CW ja1xyz 549 599"
        );
        let two = "40m cw\n0900 40m CW ja1xyz 6 7";
        assert_eq!(
            apply(two, &full(two, 1, 0)),
            "40m cw\n0900 40m CW ja1xyz 569 579"
        );
    }

    #[test]
    fn full_expands_time_shorthand_using_the_previous_line() {
        let text = "40m cw\n0900 ja1qso\n15 ja1xyz";
        assert_eq!(
            apply(text, &full(text, 2, 0)),
            "40m cw\n0900 ja1qso\n0915 40m CW ja1xyz 599 599"
        );
    }

    #[test]
    fn full_expands_time_shorthand_in_the_log_timezone() {
        // 09:15(+9) は 00:15Z。展開は、ログの時間帯(+9)の書式に戻す
        let text = "timezone +9\n40m cw\n0900 ja1qso\n15 ja1xyz";
        assert_eq!(
            apply(text, &full(text, 3, 0)),
            "timezone +9\n40m cw\n0900 ja1qso\n0915 40m CW ja1xyz 599 599"
        );
    }

    #[test]
    fn full_keeps_what_the_user_wrote_in_place() {
        let text = "40m cw\nja1xyz jaff-0218 {松本市} <hello>";
        assert_eq!(
            apply(text, &full(text, 1, 0)),
            "40m cw\n0905 40m CW ja1xyz 599 599 jaff-0218 {松本市} <hello>"
        );
    }

    #[test]
    fn full_reads_rst_past_a_comment_like_the_compiler() {
        let text = "40m cw\n0900 40m CW ja1xyz <hi> 5 7";
        assert_eq!(
            apply(text, &full(text, 1, 0)),
            "40m cw\n0900 40m CW ja1xyz <hi> 559 579"
        );
    }

    #[test]
    fn full_does_nothing_for_a_line_with_errors() {
        // バンドが未指定 → エラー。確定しても直せない
        assert!(full("mycall JA1ABC\nja1xyz", 1, 0).is_empty());
    }

    #[test]
    fn full_does_nothing_for_lines_that_are_not_qsos() {
        let text = "mycall JA1ABC\n40m cw\n\nday +\nssb";
        for line in 0..5 {
            assert!(full(text, line, 0).is_empty(), "line {line}");
        }
    }

    #[test]
    fn full_is_idempotent() {
        for (text, line, tz) in [
            ("40m cw\nja1xyz", 1, 0),
            ("40m cw\n0900 ja1qso\n15 ja1xyz 6", 2, 0),
            ("40m ssb\nja1xyz jaff-0218 {松本市}", 1, 9),
            ("20m ft8\nja1xyz -05", 1, 0),
        ] {
            let once = apply(text, &full(text, line, tz));
            // 先頭に timezone の行が増えたときは、行番号もその分ずれる
            let shift = once.split('\n').count() as isize - text.split('\n').count() as isize;
            let line = (line as isize + shift) as usize;
            assert!(full(&once, line, tz).is_empty(), "{once:?}");
        }
    }

    #[test]
    fn full_does_not_change_how_the_line_is_interpreted() {
        // 確定は、見た目を明示するだけ。解釈(コール・バンド・周波数・モード・RST・
        // リファレンス・コメント)は変わらない
        for (text, line) in [
            ("40m cw\nja1xyz", 1usize),
            ("40m ssb\n0900 ja1qso\n15 ja1xyz 4 {QTH} jaff-0218", 2),
            ("7.025 cw\nja1xyz 5 7 <hi>", 1),
            ("20m ft8\nja1xyz -12", 1),
        ] {
            let before = compile_fle(text)
                .records
                .into_iter()
                .find(|r| r.line == line)
                .unwrap();
            let filled = apply(text, &full(text, line, 0));
            let after = compile_fle(&filled)
                .records
                .into_iter()
                .find(|r| r.line == line)
                .unwrap();
            assert_eq!(before.callsign, after.callsign, "{filled:?}");
            assert_eq!(
                (&before.band, &before.freq),
                (&after.band, &after.freq),
                "{filled:?}"
            );
            assert_eq!(before.mode, after.mode, "{filled:?}");
            assert_eq!(
                (&before.rst_sent, &before.rst_rcvd),
                (&after.rst_sent, &after.rst_rcvd),
                "{filled:?}"
            );
            assert_eq!(
                (&before.hissota, &before.hispota),
                (&after.hissota, &after.hispota),
                "{filled:?}"
            );
            assert_eq!(
                (&before.qsomsg, &before.qsormks),
                (&after.qsomsg, &after.qsormks),
                "{filled:?}"
            );
        }
    }

    // ---- 確定の範囲を選ぶ(時刻は常に。バンド・モードとRSTは独立) ----

    fn with(band_mode: bool, rst: bool, text: &str, line: usize) -> String {
        let scope = FillScope {
            expand_time: true,
            band_mode,
            rst,
            ..FillScope::TIME
        };
        apply(text, &fill_with(text, line, NOW, 0, scope))
    }

    #[test]
    fn time_only_writes_just_the_time() {
        let text = "40m cw\nja1xyz";
        assert_eq!(with(false, false, text, 1), "40m cw\n0905 ja1xyz");
    }

    #[test]
    fn rst_only_leaves_band_and_mode_to_the_setting_lines() {
        let text = "40m cw\nja1xyz";
        assert_eq!(with(false, true, text, 1), "40m cw\n0905 ja1xyz 599 599");
    }

    #[test]
    fn band_and_mode_only_leaves_the_rst_omitted() {
        let text = "40m cw\nja1xyz";
        assert_eq!(with(true, false, text, 1), "40m cw\n0905 40m CW ja1xyz");
    }

    #[test]
    fn rst_only_still_expands_rst_shorthand() {
        let text = "40m cw\n0900 ja1xyz 4";
        assert_eq!(with(false, true, text, 1), "40m cw\n0900 ja1xyz 549 599");
    }

    #[test]
    fn without_rst_the_shorthand_is_left_as_typed() {
        let text = "40m cw\n0900 ja1xyz 4";
        assert_eq!(with(true, false, text, 1), "40m cw\n0900 40m CW ja1xyz 4");
    }

    #[test]
    fn time_shorthand_is_expanded_only_when_asked_to() {
        let text = "40m cw\n0900 ja1qso\n15 ja1xyz";
        assert_eq!(
            with(false, false, text, 2),
            "40m cw\n0900 ja1qso\n0915 ja1xyz"
        );
        let scope = FillScope::TIME;
        assert!(fill_with(text, 2, NOW, 0, scope).is_empty());
    }

    #[test]
    fn every_combination_keeps_the_meaning_and_is_idempotent() {
        let cases = [
            ("40m cw\nja1xyz", 1usize),
            ("40m ssb\n0900 ja1qso\n15 ja1xyz 4 {QTH} jaff-0218", 2),
            ("7.025 cw\nja1xyz 5 7 <hi>", 1),
            ("20m ft8\nja1xyz -12", 1),
        ];
        for band_mode in [false, true] {
            for rst in [false, true] {
                let scope = FillScope {
                    expand_time: true,
                    band_mode,
                    rst,
                    ..FillScope::TIME
                };
                for (text, line) in cases {
                    let before = compile_fle(text)
                        .records
                        .into_iter()
                        .find(|r| r.line == line)
                        .unwrap();
                    let filled = apply(text, &fill_with(text, line, NOW, 0, scope));
                    let after = compile_fle(&filled)
                        .records
                        .into_iter()
                        .find(|r| r.line == line)
                        .unwrap();
                    let ctx = format!("band_mode={band_mode} rst={rst} {filled:?}");
                    assert_eq!(before.callsign, after.callsign, "{ctx}");
                    assert_eq!(
                        (&before.band, &before.freq),
                        (&after.band, &after.freq),
                        "{ctx}"
                    );
                    assert_eq!(before.mode, after.mode, "{ctx}");
                    assert_eq!(
                        (&before.rst_sent, &before.rst_rcvd),
                        (&after.rst_sent, &after.rst_rcvd),
                        "{ctx}"
                    );
                    assert_eq!(
                        (&before.qsomsg, &before.qsormks),
                        (&after.qsomsg, &after.qsormks),
                        "{ctx}"
                    );

                    let shift =
                        filled.split('\n').count() as isize - text.split('\n').count() as isize;
                    let again = fill_with(&filled, (line as isize + shift) as usize, NOW, 0, scope);
                    assert!(again.is_empty(), "{ctx}");
                }
            }
        }
    }

    #[test]
    fn scope_is_read_from_camel_case_json() {
        let scope: FillScope = serde_json::from_str(r#"{"bandMode":true}"#).unwrap();
        assert_eq!(
            scope,
            FillScope {
                expand_time: false,
                band_mode: true,
                rst: false,
                date: false,
                no_clock: false,
                day_rollover: false,
            }
        );
        let on: FillScope = serde_json::from_str(r#"{"dayRollover":true}"#).unwrap();
        assert!(on.day_rollover);
        let none: FillScope = serde_json::from_str("{}").unwrap();
        assert_eq!(none, FillScope::TIME);
    }

    #[test]
    fn full_writes_the_frequency_when_the_log_uses_a_frequency() {
        // バンドを入れると周波数が 7MHz に戻ってしまう。周波数を入れる
        let text = "7.025 cw\nja1xyz";
        assert_eq!(
            apply(text, &full(text, 1, 0)),
            "7.025 cw\n0905 7.025 CW ja1xyz 599 599"
        );
    }

    #[test]
    fn time_scope_also_fills_a_line_that_starts_with_a_band() {
        let text = "40m cw\n40m ja1xyz";
        assert_eq!(fill(text, 1, NOW, 0), vec![edit(7, "0905 ")]);
    }

    #[test]
    fn a_digit_first_callsign_gets_the_time_and_the_rest_like_any_other() {
        let text = "40m cw\n7k1abc";
        assert_eq!(apply(text, &fill(text, 1, NOW, 0)), "40m cw\n0905 7k1abc");
        assert_eq!(
            apply(text, &full(text, 1, 0)),
            "40m cw\n0905 40m CW 7k1abc 599 599"
        );
    }

    fn rollover(text: &str, line: usize, tz: i32) -> String {
        let scope = FillScope {
            day_rollover: true,
            ..FillScope::TIME
        };
        apply(text, &fill_with(text, line, NOW, tz, scope))
    }

    #[test]
    fn writes_day_plus_when_a_typed_time_goes_past_midnight() {
        let text = "date 2026-10-17\n40m cw\n2358 ja1aaa\n0002 jh1hhh";
        assert_eq!(
            rollover(text, 3, 0),
            "date 2026-10-17\n40m cw\n2358 ja1aaa\nday +\n0002 jh1hhh"
        );
        // 書いたあとは、もう書かない(冪等)
        let done = "date 2026-10-17\n40m cw\n2358 ja1aaa\nday +\n0002 jh1hhh";
        assert_eq!(rollover(done, 4, 0), done);
    }

    #[test]
    fn day_plus_follows_the_log_time_not_utc() {
        // JST のログ: 23:58 のあとの 00:02(UTC でも戻る)。ログの時刻で 21 時以降・3 時未満を見る
        // (UTC の 14:58 のあとの 15:02 と取り違えない。UTC の時刻では条件に当たらない)
        let text = "timezone +9\ndate 2026-10-17\n40m cw\n2358 ja1aaa\n0002 jh1hhh";
        assert_eq!(
            rollover(text, 4, 0),
            "timezone +9\ndate 2026-10-17\n40m cw\n2358 ja1aaa\nday +\n0002 jh1hhh"
        );
    }

    #[test]
    fn day_plus_is_not_written_for_other_going_backs() {
        // 前が 21 時より前
        let early = "date 2026-10-17\n40m cw\n2000 ja1aaa\n0100 jh1hhh";
        assert_eq!(rollover(early, 3, 0), early);
        // 今が 3 時以降
        let late = "date 2026-10-17\n40m cw\n2358 ja1aaa\n0300 jh1hhh";
        assert_eq!(rollover(late, 3, 0), late);
        // ふつうの戻り
        let back = "date 2026-10-17\n40m cw\n1030 ja1aaa\n0930 jh1hhh";
        assert_eq!(rollover(back, 3, 0), back);
        // 戻っていない
        let fwd = "date 2026-10-17\n40m cw\n2330 ja1aaa\n2359 jh1hhh";
        assert_eq!(rollover(fwd, 3, 0), fwd);
    }

    #[test]
    fn day_plus_is_not_written_when_the_date_was_set_back() {
        // 日付を前に戻したログでは、書いても戻ったままなので書かない(確定のたびに増えない)
        let text = "date 2026-10-17\n40m cw\n2358 ja1aaa\ndate 2026-10-16\n0002 jh1hhh";
        assert_eq!(rollover(text, 4, 0), text);
    }

    #[test]
    fn day_plus_is_only_written_when_asked() {
        let text = "date 2026-10-17\n40m cw\n2358 ja1aaa\n0002 jh1hhh";
        assert_eq!(fill(text, 3, NOW, 0), vec![]);
    }
}
