//! 補完結果の確定。入力中の行に足りない要素を、テキストの修正(`Edit`)として返す。
//!
//! 補完した結果はログのテキストに書き込んで残す(開き直しても、再解釈しても同じになる)。
//! コアは時計を持たない。「いまの時刻」は呼び出し側から受け取る。
//!
//! 確定の範囲(`FillScope`):
//! - `Time`: 時刻のない QSO 行の、行頭の時刻(`HHMM `)だけ。
//! - `Full`: 時刻、バンド・モード、RST。省略されたものを挿入し、省略形(`15`、`4` など)は
//!   解決した値に置き換える。利用者が書いたリファレンスやコメントは動かさない。
//!
//! 時刻の書式は、ログの `timezone` 指定に従う(なければ UTC)。

use chrono::{DateTime, Duration, NaiveDate};
use serde::Serialize;

use crate::compiler::compile_fle;
use crate::tokenizer::{tokenize, Token, TokenInfo};
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FillScope {
    /// 時刻だけ(Enter での確定)
    Time,
    /// 時刻・バンド・モード・RST(確定ボタン)
    Full,
}

/// 時刻だけを確定する。`fill_with(.., FillScope::Time)` と同じ。
pub fn fill(text: &str, line: usize, now_ms: i64, default_tz: i32) -> Vec<Edit> {
    fill_with(text, line, now_ms, default_tz, FillScope::Time)
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
    let trimmed = target.trim();
    let tokens = tokenize(trimmed);
    let Some(shape) = QsoShape::of(&tokens) else {
        return Vec::new();
    };

    // 位置の換算: トークンの位置(行内の文字数)→ テキスト全体のUTF-16の位置
    let base = line_start_utf16(&lines, line) + leading_spaces_utf16(target);
    let Some(spans) = Spans::new(trimmed, &tokens, base) else {
        return Vec::new();
    };

    // 時刻の意味(タイムゾーン)は、ログで最初に決まったものに従う
    let before_tz = timezone_before(&lines[..line]);

    // 確定ボタン: エラーのある行や、解釈できない行は、何も変えない
    let record = match scope {
        FillScope::Time => None,
        FillScope::Full => {
            let compiled = compile_fle(text);
            if compiled.errors.iter().any(|e| e.line == line) {
                return Vec::new();
            }
            match compiled.records.into_iter().find(|r| r.line == line) {
                Some(r) => Some(r),
                None => return Vec::new(),
            }
        }
    };

    // (位置, 同じ位置に入れるときの順序, 修正)。同じ位置の挿入は、順序どおりに1つへまとめる
    let mut parts: Vec<(usize, u8, Edit)> = Vec::new();

    // --- 時刻 ---
    match shape.time {
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
            let hhmm = (now + Duration::hours(i64::from(tz))).format("%H%M");
            parts.push((base, 1, insert_at(base, format!("{hhmm} "))));
        }
        Some(i) => {
            // 省略形(分だけ・H:MM)は、確定ボタンのときだけ HHMM に展開する
            if let (FillScope::Full, Some(rec), Token::Decimal { digits, .. }) =
                (scope, record.as_ref(), &tokens[i].token)
            {
                if *digits < 4 {
                    let hhmm = local_hhmm(rec, before_tz.unwrap_or(0));
                    if let Some(hhmm) = hhmm {
                        let (from, to) = spans.range(i);
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

    if let (FillScope::Full, Some(rec)) = (scope, record.as_ref()) {
        // --- バンド・モード(コールサインの前に置く。RSTの既定値の判定にも使われる位置) ---
        let mut front = String::new();
        if !shape.has_band {
            // 周波数で指定されているログでは、バンドを入れると周波数が既定値に戻ってしまうので、
            // 周波数そのものを入れる(バンドで指定されているなら、バンドを入れる)
            if is_mhz(&rec.freq) {
                front.push_str(&format!("{} ", rec.freq));
            } else if !rec.band.is_empty() {
                front.push_str(&format!("{} ", rec.band));
            }
        }
        if !shape.has_mode && !rec.mode.is_empty() {
            front.push_str(&format!("{} ", rec.mode));
        }
        if !front.is_empty() {
            let at = spans.range(shape.call).0;
            parts.push((at, 2, insert_at(at, front)));
        }

        // --- RST(コールサインの直後の2つ) ---
        let (sent, rcvd) = (&rec.rst_sent, &rec.rst_rcvd);
        let mut last_end = spans.range(shape.call).1;
        for (slot, value) in shape.rst.iter().zip([sent, rcvd]) {
            match slot {
                Some(i) => {
                    let (from, to) = spans.range(*i);
                    if tokens[*i].raw != *value {
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

/// QSO行の構造: どのトークンがコールサイン・時刻・RSTか
struct QsoShape {
    call: usize,
    /// 時刻(数値)のトークン。なければ時刻を省いた行
    time: Option<usize>,
    has_band: bool,
    has_mode: bool,
    /// コールサイン直後の、送信・受信のRST(あれば)
    rst: [Option<usize>; 2],
}

impl QsoShape {
    /// コールサインを含み、その前が 時刻/バンド/周波数/モード/コメント だけの行
    fn of(tokens: &[TokenInfo]) -> Option<Self> {
        let call = tokens
            .iter()
            .position(|t| matches!(t.token, Token::Call(_)))?;
        let mut time = None;
        for (i, t) in tokens[..call].iter().enumerate() {
            match t.token {
                Token::Decimal { .. } if time.is_none() => time = Some(i),
                Token::Band { .. } | Token::Freq(_) | Token::Mode(_) | Token::Comment { .. } => {}
                _ => return None,
            }
        }
        let has_band = tokens
            .iter()
            .any(|t| matches!(t.token, Token::Band { .. } | Token::Freq(_)));
        let has_mode = tokens.iter().any(|t| matches!(t.token, Token::Mode(_)));

        // コンパイラと同じく、コメントは読み飛ばし、数値/SNRが続く間だけRSTとして読む
        let mut rst = [None, None];
        let mut rest = tokens
            .iter()
            .enumerate()
            .skip(call + 1)
            .filter(|(_, t)| !matches!(t.token, Token::Comment { .. }));
        for slot in &mut rst {
            match rest.next() {
                Some((i, t)) if matches!(t.token, Token::Decimal { .. } | Token::Snr(_)) => {
                    *slot = Some(i);
                }
                _ => break,
            }
        }
        Some(Self {
            call,
            time,
            has_band,
            has_mode,
            rst,
        })
    }
}

/// トークンの位置(行内の文字数)を、テキスト全体でのUTF-16の位置に換算する
struct Spans {
    /// トークンごとの (開始, 終了)
    ranges: Vec<(usize, usize)>,
}

impl Spans {
    /// 換算できない(トークンの位置と文字列が合わない)ときは None
    fn new(line: &str, tokens: &[TokenInfo], base: usize) -> Option<Self> {
        let chars: Vec<char> = line.chars().collect();
        let mut ranges = Vec::with_capacity(tokens.len());
        for t in tokens {
            let n = t.raw.chars().count();
            let slice: String = chars.get(t.position..t.position + n)?.iter().collect();
            if slice != t.raw {
                return None;
            }
            let from = base
                + chars[..t.position]
                    .iter()
                    .map(|c| c.len_utf16())
                    .sum::<usize>();
            ranges.push((from, from + t.raw.encode_utf16().count()));
        }
        Some(Self { ranges })
    }

    fn range(&self, token: usize) -> (usize, usize) {
        self.ranges[token]
    }
}

/// `7.025` のような、MHzの小数で書かれた周波数か(バンドの既定の周波数 `7MHz` ではない)
fn is_mhz(freq: &str) -> bool {
    let mut parts = freq.split('.');
    matches!((parts.next(), parts.next(), parts.next()),
        (Some(i), Some(f), None) if !i.is_empty() && !f.is_empty()
            && i.bytes().all(|b| b.is_ascii_digit()) && f.bytes().all(|b| b.is_ascii_digit()))
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
    lines.iter().rev().find_map(|l| {
        let tokens = tokenize(l.trim());
        match (
            tokens.first().map(|t| &t.token),
            tokens.get(1).map(|t| &t.token),
        ) {
            (Some(Token::Keyword { key, .. }), Some(Token::Snr(tz))) if key == "timezone" => {
                tz.parse().ok()
            }
            _ => None,
        }
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

    /// 修正を、後ろの位置のものから順に適用する(UTF-16の位置で)
    fn apply(text: &str, edits: &[Edit]) -> String {
        let mut units: Vec<u16> = text.encode_utf16().collect();
        let mut sorted: Vec<&Edit> = edits.iter().collect();
        sorted.sort_by_key(|e| std::cmp::Reverse(e.from));
        for e in sorted {
            units.splice(e.from..e.to, e.insert.encode_utf16());
        }
        String::from_utf16(&units).unwrap()
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

    // ---- Full(確定ボタン) ----

    fn full(text: &str, line: usize, tz: i32) -> Vec<Edit> {
        fill_with(text, line, NOW, tz, FillScope::Full)
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
}
