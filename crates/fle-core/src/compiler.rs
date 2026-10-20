//! FLE のコンパイル(評価)。構文木(`syntax.rs`)を、行ごとに畳み込んで、QSOの記録と誤りを作る。
//!
//! 構文(どの語がどの役か)は `syntax.rs`。ここは意味: 状態(日付・時刻・バンド・モード・運用場所など)の
//! 引き継ぎと、QSOの記録の組み立て。

use chrono::{Datelike, Duration, NaiveDate, Timelike};

use crate::callsign::parse_callsign;
use crate::ham::freq_to_band;
use crate::syntax::{
    parse_line, CommentKind, DateValue, DirValue, Directive, LineKind, QsoItem, RefKind, Rst, Span,
    Spanned, SyntaxError,
};
use crate::types::{
    FleCompileResult, FleEnvironment, FleError, FleQsoRecord, RstType, RstValue, MODE_TABLE,
};

pub use crate::syntax::canonical_grid;

/// FLEテキストをコンパイル
pub fn compile_fle(input: &str) -> FleCompileResult {
    let Fold {
        env,
        records,
        has_sota,
        has_wwff,
        has_pota,
        has_contest,
        ..
    } = fold(input);

    // 結果を構築
    let status = if env.errors.is_empty() { "OK" } else { "ERR" };
    let log_type = determine_log_type(has_sota, has_wwff, has_pota);

    FleCompileResult {
        status: status.to_string(),
        log_type,
        mycall: env.mycall.clone(),
        operator: env.operator.clone(),
        mysota: env.mysota.clone(),
        mywwff: env.mywwff.clone(),
        mypota: env.mypota.clone(),
        mygrid: env.mygrid.clone(),
        qslmsg: expand_rig(&env.qslmsg, &env.rig),
        records,
        errors: env.errors,
        has_sota,
        has_wwff,
        has_pota,
        has_contest,
    }
}

/// 行ごとに畳み込んだ結果。コンパイルの結果と、ある行の時点の状態(`line_info`)の、両方の元。
pub(crate) struct Fold {
    /// 最後の行を読んだあとの状態
    pub env: FleEnvironment,
    pub records: Vec<FleQsoRecord>,
    pub has_sota: bool,
    pub has_wwff: bool,
    pub has_pota: bool,
    pub has_contest: bool,
    /// 最後のQSOのあとに、`date` / `day` で日付を変えたか
    pub date_moved: bool,
}

pub(crate) fn fold(input: &str) -> Fold {
    let mut env = FleEnvironment::default();
    let mut records: Vec<FleQsoRecord> = Vec::new();
    let mut has_sota = false;
    let mut has_wwff = false;
    let mut has_pota = false;
    let mut has_contest = false;
    let mut date_moved = false;
    let mut line_start = 0usize; // この行の、テキスト全体での位置(UTF-16)

    for (line_num, raw_line) in input.split('\n').enumerate() {
        let here = Here {
            line: line_num,
            start: line_start,
        };
        line_start += raw_line.encode_utf16().count() + 1;
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);

        let ast = parse_line(line);
        if ast.kind == LineKind::Blank {
            continue;
        }
        // 現在のQSO状態をリセット
        env.reset_current_qso();
        for e in &ast.errors {
            here.push(&mut env, e);
        }

        match &ast.kind {
            LineKind::Blank => {}
            LineKind::Directive(d) => {
                apply_directive(&mut env, d, here);
                date_moved |= matches!(d.value, Some(DirValue::Date(_) | DirValue::Day(_)));
                has_sota |= !env.mysota.is_empty();
                has_wwff |= !env.mywwff.is_empty();
                has_pota |= !env.mypota.is_empty();
                has_contest |= env.contest_num.is_some() || env.contest_lit.is_some();
            }
            LineKind::Qso(items) => {
                if let Some(record) = eval_qso(items, &mut env, here) {
                    records.push(record);
                    date_moved = false;
                }
            }
        }
    }

    Fold {
        env,
        records,
        has_sota,
        has_wwff,
        has_pota,
        has_contest,
        date_moved,
    }
}

/// いま読んでいる行の位置(誤りの座標を、テキスト全体にするため)
#[derive(Clone, Copy)]
struct Here {
    line: usize,
    start: usize,
}

impl Here {
    /// 構文・評価の誤りを、環境の誤り一覧に足す
    fn push(self, env: &mut FleEnvironment, e: &SyntaxError) {
        env.errors.push(FleError {
            line: self.line,
            column: e.span.0,
            message: e.message.clone(),
            code: e.code.to_string(),
            args: e.args.clone(),
            from: self.start + e.span.0,
            to: self.start + e.span.1,
        });
    }

    fn error(
        self,
        env: &mut FleEnvironment,
        code: &'static str,
        args: &[&str],
        span: Span,
        message: impl Into<String>,
    ) {
        self.push(env, &SyntaxError::new(code, args, span, message));
    }
}

// ---------------------------------------------------------------------------
// 指令
// ---------------------------------------------------------------------------

fn validate_date(year: u32, month: u32, day: u32) -> bool {
    (1900..=2100).contains(&year) && (1..=12).contains(&month) && (1..=31).contains(&day)
}

/// 基準日付と、いまのQSOの日付を同時に変える(時刻は 00:00 に戻る)
fn set_date(env: &mut FleEnvironment, year: u16, month: u8, day: u8) {
    env.year = year;
    env.month = month;
    env.day = day;
    env.date_set = true;
    env.current.year = year;
    env.current.month = month;
    env.current.day = day;
    env.current.hour = 0;
    env.current.min = 0;
}

fn apply_directive(env: &mut FleEnvironment, d: &Directive, here: Here) {
    let Some(value) = &d.value else { return };
    // 日付の誤りは、値の位置に出す
    let arg = d.arg_spans.first().copied().unwrap_or(d.key_span);
    match value {
        DirValue::Mycall(call) => {
            env.mycall = call.clone();
            if let Some((_, base, _, _)) = parse_callsign(call) {
                env.operator = base;
            }
        }
        DirValue::Operator(call) => env.operator = call.clone(),
        DirValue::Sota(v) => env.mysota = v.clone().unwrap_or_default(),
        DirValue::Wwff(v) => env.mywwff = v.clone().unwrap_or_default(),
        DirValue::Pota(v) => env.mypota = v.clone().unwrap_or_default(),
        DirValue::Grid(v) => env.mygrid = v.clone().unwrap_or_default(),
        DirValue::Date(DateValue::Ymd { year, month, day }) => {
            if validate_date(*year, *month, *day) {
                set_date(env, *year as u16, *month as u8, *day as u8);
            } else {
                here.error(env, "date_out_of_range", &[], arg, "Date out of range.");
            }
        }
        DirValue::Date(DateValue::Md { month, day }) => {
            if validate_date(u32::from(env.year), *month, *day) {
                let year = env.year;
                set_date(env, year, *month as u8, *day as u8);
            } else {
                here.error(env, "date_out_of_range", &[], arg, "Date out of range.");
            }
        }
        DirValue::Day(days) => match NaiveDate::from_ymd_opt(
            i32::from(env.year),
            u32::from(env.month),
            u32::from(env.day),
        ) {
            Some(date) => {
                let next = date + Duration::days(*days);
                set_date(
                    env,
                    next.year() as u16,
                    next.month() as u8,
                    next.day() as u8,
                );
            }
            None => here.error(env, "date_out_of_range", &[], arg, "Date out of range."),
        },
        DirValue::Timezone(tz) => env.timezone = Some(*tz),
        DirValue::Rig(rig) => {
            env.rig = if rig == "-" {
                String::new()
            } else {
                rig.clone()
            }
        }
        DirValue::Nickname(n) => env.nickname = n.clone(),
        DirValue::NumberConsecutive => env.contest_num = Some(1),
        DirValue::NumberLiteral(lit) => env.contest_lit = Some(lit.clone()),
        DirValue::Qslmsg(msg) => {
            // 変数は、この指令の時点の値で置き換える
            env.qslmsg = msg
                .replace("$mywwff", &env.mywwff)
                .replace("$mysota", &env.mysota)
                .replace("$mypota", &env.mypota.join(" "));
            // `$rig` は、QSOごとに、そのときの `rig` で置き換える(あとで `rig` を変えても、メッセージを書き直さなくてよい)
        }
        DirValue::Qslmsg2(msg) => env.qslmsg2 = msg.clone(),
    }
}

// ---------------------------------------------------------------------------
// QSOの行
// ---------------------------------------------------------------------------

/// 時刻の語(桁数で、分の1の位・分・H:MM・HH:MM)。誤りなら、メッセージを返す。
///
/// 分だけの省略形(1〜2桁)で、分が前より小さくなったら、時を進める(`0955` の次の `05` は 10:05)。
fn process_time(env: &mut FleEnvironment, digits: usize, value: &str) -> Result<(), &'static str> {
    let v: u32 = value.parse().map_err(|_| "Invalid time")?;
    let min_of = |v: u32| {
        if v < 60 {
            Ok(v as u8)
        } else {
            Err("Invalid time")
        }
    };
    match digits {
        1 | 2 => {
            let new_min = if digits == 1 {
                (env.current.min / 10) * 10 + (v % 10) as u8
            } else {
                min_of(v)?
            };
            if new_min < env.current.min {
                if env.current.hour >= 23 {
                    return Err("Time overflow (use `day +`)");
                }
                env.current.hour += 1;
            }
            env.current.min = new_min;
        }
        3 => {
            // H:MM(時の1の位と、分)
            let min = min_of(v % 100)?;
            env.current.hour = (env.current.hour / 10) * 10 + (v / 100) as u8;
            env.current.min = min;
        }
        4 => {
            // HH:MM
            let (hour, min) = (v / 100, min_of(v % 100)?);
            if hour > 23 {
                return Err("Invalid time");
            }
            env.current.hour = hour as u8;
            env.current.min = min;
        }
        _ => return Err("Invalid time"),
    }
    Ok(())
}

/// いまのモードのレポートの形(RST・RS・SNR)
fn rst_type(env: &FleEnvironment) -> RstType {
    let mode_lower = env.current.mode.to_lowercase();
    MODE_TABLE
        .get(mode_lower.as_str())
        .copied()
        .unwrap_or(RstType::Rst)
}

/// デフォルトRSTを設定
fn set_default_rst(env: &mut FleEnvironment) {
    let default = match rst_type(env) {
        RstType::Rst => RstValue::default(),
        RstType::Rs => RstValue::default_rs(),
        RstType::Snr => RstValue::default_snr(),
    };
    env.current.rst_sent = default.clone();
    env.current.rst_rcvd = default;
}

/// 書かれた RST の値。省略形は、行のモード(`kind`)のレポートの形に合わせて補う
fn rst_value(rst: &Rst, kind: RstType) -> RstValue {
    match rst {
        Rst::Digits { digits, value } => RstValue::parse_rst(value.parse().unwrap_or(59), *digits, kind),
        Rst::Snr(s) => RstValue::Snr(s.clone()),
    }
}

/// QSOの行を評価する。コールサインがあれば、記録を作る。
fn eval_qso(
    items: &[Spanned<QsoItem>],
    env: &mut FleEnvironment,
    here: Here,
) -> Option<FleQsoRecord> {
    // 現在の日付を、基準日付から引き継ぐ
    env.current.year = env.year;
    env.current.month = env.month;
    env.current.day = env.day;

    let mut after_band = false; // バンドの直後の周波数は、そのバンドの周波数の指定
    let mut angle: Option<String> = None; // <…>: QSOメッセージ
    let mut curly: Option<String> = None; // {…}: 備考
    let mut plain: Vec<String> = Vec::new(); // 平文の語(並べた順)
                                             // 書かれたRST。モードがコールサインのあとに来ても既定値が合うよう、行の最後に重ねる
    let mut written_rst: (Option<Rst>, Option<Rst>) = (None, None);

    for it in items {
        if let QsoItem::Comment { kind, content, .. } = &it.node {
            match kind {
                CommentKind::Angle => angle = Some(content.clone()),
                CommentKind::Square => env.current.qsl_msg = content.clone(),
                CommentKind::Curly => curly = Some(content.clone()),
            }
            continue; // 注釈は、バンドの直後の判定に影響しない
        }
        let refine = std::mem::take(&mut after_band);
        match &it.node {
            QsoItem::Comment { .. } => {}
            QsoItem::Mode(m) => env.current.mode = m.clone(),
            QsoItem::Band { band, freq } => {
                env.current.band = band.clone();
                env.current.freq = freq.clone();
                after_band = true;
            }
            QsoItem::Freq(f) => {
                env.current.freq = f.clone();
                match freq_to_band(f) {
                    Ok((_, _, band)) => env.current.band = band.to_string(),
                    Err(_) if refine => {
                        here.error(env, "out_of_band", &[f], it.span, "Out of the band.")
                    }
                    Err(_) => here.error(env, "unknown_band", &[f], it.span, "Unknown band."),
                }
            }
            QsoItem::Time { digits, value } => {
                if let Err(message) = process_time(env, *digits, value) {
                    let code = if message.starts_with("Time overflow") {
                        "time_overflow"
                    } else {
                        "invalid_time"
                    };
                    here.error(env, code, &[value], it.span, format!("{message}: {value}"));
                }
            }
            QsoItem::Call {
                call,
                rst_sent,
                rst_rcvd,
            } => {
                if !env.current.call.is_empty() {
                    here.error(
                        env,
                        "duplicate_callsign",
                        &[call],
                        it.span,
                        format!("Each line must contains only one callsign: {call}"),
                    );
                }
                env.current.call = call.clone();
                // RST は、省略したら、モード別の既定値
                set_default_rst(env);
                // 省略形の補い方は、行のモードで決まる(コールサインのあとにモードを書いても)ので、値にするのは行の終わり
                written_rst = (
                    rst_sent.as_ref().map(|r| r.node.clone()),
                    rst_rcvd.as_ref().map(|r| r.node.clone()),
                );
            }
            QsoItem::Ref { kind, code } => match kind {
                RefKind::Sota => env.current.his_sota = code.clone(),
                RefKind::Wwff => env.current.his_wwff = code.clone(),
                RefKind::Pota => env.current.his_pota.push(code.clone()),
            },
            QsoItem::Grid(grid) => env.current.his_grid = grid.clone(),
            QsoItem::ContestSent(num) => {
                if let Some(contest_num) = &mut env.contest_num {
                    if let Ok(n) = num.parse::<u32>() {
                        env.current.his_num = format!("{:03}", n);
                        *contest_num = n + 1;
                    }
                } else if env.contest_lit.is_some() {
                    env.current.his_num = num.to_uppercase();
                }
            }
            QsoItem::ContestRcvd(num) => {
                env.current.my_num = num.clone();
                if env.current.his_num.is_empty() {
                    if let Some(contest_num) = &mut env.contest_num {
                        env.current.his_num = format!("{:03}", *contest_num);
                        *contest_num += 1;
                    } else if let Some(lit) = &env.contest_lit {
                        env.current.his_num = lit.clone();
                    }
                }
            }
            QsoItem::Word(text) => plain.push(text.clone()),
            QsoItem::Misplaced { class, text } => {
                use crate::syntax::Class;
                match class {
                    Class::Unknown(u) => here.error(
                        env,
                        "unknown_word",
                        &[u],
                        it.span,
                        format!("Unknown literal: {u}"),
                    ),
                    Class::Keyword(k) => here.error(
                        env,
                        "unexpected_keyword",
                        &[k],
                        it.span,
                        format!("Unexpected keyword: {k}"),
                    ),
                    _ => here.error(
                        env,
                        "unexpected_word",
                        &[text],
                        it.span,
                        format!("Unexpected word: {text}"),
                    ),
                }
            }
        }
    }

    // RST: 省略した側は、行のモード(コールサインのあとに書いても)の既定値
    if !env.current.call.is_empty() {
        set_default_rst(env);
        let kind = rst_type(env);
        if let Some(r) = &written_rst.0 {
            env.current.rst_sent = rst_value(r, kind);
        }
        if let Some(r) = &written_rst.1 {
            env.current.rst_rcvd = rst_value(r, kind);
        }
    }

    // メッセージと備考: 括弧の注釈があれば、それ。なければ、平文の語を並べた順に
    // (最初の1語がメッセージ、残りが備考)。大文字小文字は、入力のまま。
    let mut plain = plain.into_iter();
    env.current.qso_msg = angle.or_else(|| plain.next()).unwrap_or_default();
    env.current.qso_rmks = curly.unwrap_or_else(|| plain.collect::<Vec<_>>().join(" "));

    // コールサインのない行は、設定の行(バンド・周波数・モード・注釈だけ)でなければ、誤り
    if env.current.call.is_empty() {
        let is_setting = |n: &QsoItem| {
            matches!(
                n,
                QsoItem::Band { .. }
                    | QsoItem::Freq(_)
                    | QsoItem::Mode(_)
                    | QsoItem::Comment { .. }
            )
        };
        if let (Some(first), Some(last)) = (items.first(), items.last()) {
            if items.iter().any(|it| !is_setting(&it.node)) {
                let span = (first.span.0, last.span.1);
                here.error(
                    env,
                    "missing_callsign",
                    &[],
                    span,
                    "Callsign is required in a QSO line.",
                );
            }
        }
    }

    // コールサインがあればQSOレコードを生成
    if env.current.call.is_empty() {
        return None;
    }
    // バンド・周波数とモードは、行のどこに書いても(コールサインのあとでも)、その行のQSOに効く。
    // QSOの行で、まだ空なら誤り
    let call_span = items
        .iter()
        .find(|it| matches!(it.node, QsoItem::Call { .. }))
        .map_or((0, 0), |it| it.span);
    if env.current.band.is_empty() && env.current.freq.is_empty() {
        here.error(
            env,
            "missing_band",
            &[],
            call_span,
            "Band or frequency must be specified.",
        );
    }
    if env.current.mode.is_empty() {
        let span = call_span;
        here.error(env, "missing_mode", &[], span, "Mode must be specified.");
    }
    // UTC変換
    let utc = env.to_utc();

    Some(FleQsoRecord {
        line: here.line,
        tz: env.timezone.unwrap_or(0),
        mycall: env.mycall.clone(),
        operator: env.operator.clone(),
        date_unset: !env.date_set,
        year: utc.date().year() as u16,
        month: utc.date().month() as u8,
        day: utc.date().day() as u8,
        hour: utc.time().hour() as u8,
        min: utc.time().minute() as u8,
        callsign: env.current.call.clone(),
        band: env.current.band.clone(),
        freq: env.current.freq.clone(),
        mode: env.current.mode.clone(),
        rig: env.rig.clone(),
        rst_sent: env.current.rst_sent.to_string(),
        rst_rcvd: env.current.rst_rcvd.to_string(),
        his_num: env.current.his_num.clone(),
        my_num: env.current.my_num.clone(),
        mysota: env.mysota.clone(),
        hissota: env.current.his_sota.clone(),
        mywwff: env.mywwff.clone(),
        hiswwff: env.current.his_wwff.clone(),
        mypota: env.mypota.clone(),
        my_grid: env.mygrid.clone(),
        hispota: env.current.his_pota.clone(),
        his_grid: env.current.his_grid.clone(),
        qsomsg: env.current.qso_msg.clone(),
        qsormks: env.current.qso_rmks.clone(),
        qslmsg: expand_rig(&env.qslmsg, &env.rig),
    })
}

/// QSLメッセージの `$rig` を、そのQSOの `rig` で置き換える。`rig` が空のとき、末尾に空白が残らないようにする
pub(crate) fn expand_rig(qslmsg: &str, rig: &str) -> String {
    if !qslmsg.contains("$rig") {
        return qslmsg.to_string();
    }
    qslmsg.replace("$rig", rig).trim_end().to_string()
}

/// ログタイプを決定
fn determine_log_type(has_sota: bool, has_wwff: bool, has_pota: bool) -> String {
    if has_sota && (has_wwff || has_pota) {
        "BOTH".to_string()
    } else if has_sota {
        "SOTA".to_string()
    } else if has_wwff || has_pota {
        "WWFF".to_string()
    } else {
        "NONE".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// (送信, 受信) の RST
    fn rsts(log: &str) -> Vec<(String, String)> {
        let r = compile_fle(log);
        assert!(r.errors.is_empty(), "{:?}", r.errors);
        r.records.iter().map(|q| (q.rst_sent.clone(), q.rst_rcvd.clone())).collect()
    }

    #[test]
    fn cw_has_no_two_digit_report_so_a_two_digit_shorthand_gets_a_9() {
        assert_eq!(
            rsts("mycall JA1ABC\ndate 2026-10-18\n40m cw\n0900 ja1xyz 5 44\n0910 ja1abc 57 339"),
            vec![("559".into(), "449".into()), ("579".into(), "339".into())]
        );
    }

    #[test]
    fn phone_reports_are_two_digits_so_a_one_digit_shorthand_gets_no_9() {
        assert_eq!(
            rsts("mycall JA1ABC\ndate 2026-10-18\n40m ssb\n0900 ja1xyz 5 44\n0910 ja1abc 57 559"),
            vec![("55".into(), "44".into()), ("57".into(), "559".into())]
        );
    }

    #[test]
    fn the_shorthand_follows_a_mode_written_after_the_callsign() {
        assert_eq!(
            rsts("mycall JA1ABC\ndate 2026-10-18\n40m ssb\n0900 ja1xyz 44 cw\n0910 ja1abc 4 ssb"),
            vec![("449".into(), "599".into()), ("54".into(), "59".into())]
        );
    }

    #[test]
    fn the_default_rst_follows_a_mode_written_after_the_callsign() {
        let r = compile_fle(
            "mycall JA1ABC\ndate 2026-10-18\n40m cw\n0900 ja1xyz ssb\n0910 ja1abc 57 ssb",
        );
        assert!(r.errors.is_empty());
        assert_eq!(
            (
                r.records[0].rst_sent.as_str(),
                r.records[0].rst_rcvd.as_str()
            ),
            ("59", "59")
        );
        assert_eq!(r.records[1].rst_sent, "57");
    }

    #[test]
    fn a_qso_without_a_mode_is_an_error() {
        let r = compile_fle("mycall JA1ABC\ndate 2026-10-18\n40m\n0900 ja1xyz");
        assert_eq!(r.errors.len(), 1);
        assert_eq!(r.errors[0].code, "missing_mode");
        assert_eq!(r.errors[0].line, 3);
        let r = compile_fle("mycall JA1ABC\ndate 2026-10-18\n0900 ja1xyz");
        let codes: Vec<&str> = r.errors.iter().map(|e| e.code.as_str()).collect();
        assert_eq!(codes, vec!["missing_band", "missing_mode"]);
        // 同じ行で、コールサインのあとに書いたバンドとモードは有効
        assert!(
            compile_fle("mycall JA1ABC\ndate 2026-10-18\n0900 ja1xyz 40m cw")
                .errors
                .is_empty()
        );
        assert!(
            compile_fle("mycall JA1ABC\ndate 2026-10-18\n40m\n0900 ja1xyz cw")
                .errors
                .is_empty()
        );
        assert!(
            compile_fle("mycall JA1ABC\ndate 2026-10-18\n40m cw\n0900 ja1xyz")
                .errors
                .is_empty()
        );
    }

    #[test]
    fn test_compile_simple() {
        let input = r#"mycall JA1ABC
date 2024-01-15
mysota JA/TK-001
40m cw
0900 JA1XYZ 599 599
0905 JA2ABC 579 589
"#;
        let result = compile_fle(input);
        assert_eq!(result.status, "OK");
        assert_eq!(result.mycall, "JA1ABC");
        assert_eq!(result.mysota, "JA/TK-001");
        assert_eq!(result.records.len(), 2);

        let qso1 = &result.records[0];
        assert_eq!(qso1.callsign, "JA1XYZ");
        assert_eq!(qso1.hour, 9);
        assert_eq!(qso1.min, 0);
        assert_eq!(qso1.rst_sent, "599");

        let qso2 = &result.records[1];
        assert_eq!(qso2.callsign, "JA2ABC");
        assert_eq!(qso2.hour, 9);
        assert_eq!(qso2.min, 5);
    }

    #[test]
    fn test_compile_with_ft8() {
        let input = r#"mycall JA1ABC
date 2024-01-15
40m ft8
0900 JA1XYZ +10 -5
"#;
        let result = compile_fle(input);
        assert_eq!(result.status, "OK");
        assert_eq!(result.records.len(), 1);

        let qso = &result.records[0];
        assert_eq!(qso.mode, "FT8");
        assert_eq!(qso.rst_sent, "+10");
        assert_eq!(qso.rst_rcvd, "-5");
    }

    #[test]
    fn test_compile_with_pota() {
        let input = r#"mycall JA1ABC
date 2024-01-15
mypota JA-0001 JA-0002
40m ssb
0900 JA1XYZ 59 59 JA-0003
"#;
        let result = compile_fle(input);
        assert_eq!(result.status, "OK");
        assert!(result.has_pota);
        assert_eq!(result.mypota, vec!["JA-0001", "JA-0002"]);
        assert_eq!(result.records[0].hispota, vec!["JA-0003"]);
    }

    #[test]
    fn test_compile_with_comment() {
        let input = r#"mycall JA1ABC
date 2024-01-15
40m cw
0900 JA1XYZ 599 599 <John> {GL PM95}
"#;
        let result = compile_fle(input);
        assert_eq!(result.status, "OK");
        assert_eq!(result.records[0].qsomsg, "John");
        assert_eq!(result.records[0].qsormks, "GL PM95");
    }

    #[test]
    fn test_compile_day_increment() {
        let input = r#"mycall JA1ABC
date 2024-01-15
40m cw
0900 JA1XYZ 599 599
day +
0900 JA2ABC 599 599
"#;
        let result = compile_fle(input);
        assert_eq!(result.status, "OK");
        assert_eq!(result.records.len(), 2);
        assert_eq!(result.records[0].day, 15);
        assert_eq!(result.records[1].day, 16);
    }

    #[test]
    fn test_time_parsing() {
        let input = r#"mycall JA1ABC
date 2024-01-15
40m cw
0900 JA1XYZ 599 599
5 JA2ABC 599 599
10 JA3DEF 599 599
"#;
        let result = compile_fle(input);
        assert_eq!(result.records[0].hour, 9);
        assert_eq!(result.records[0].min, 0);
        assert_eq!(result.records[1].hour, 9);
        assert_eq!(result.records[1].min, 5);
        assert_eq!(result.records[2].hour, 9);
        assert_eq!(result.records[2].min, 10);
    }

    // ---- 運用場所(mysota / mypota / mywwff / mygrid): 現れた行以降が有効 ----

    const HEAD: &str = "mycall JA1ABC\ndate 2026-10-18\n40m cw\n";

    #[test]
    fn mygrid_is_recorded_in_canonical_form() {
        let r = compile_fle(&format!("{HEAD}mygrid pm95UQ\n0900 ja1xyz"));
        assert_eq!(r.status, "OK", "{:?}", r.errors);
        assert_eq!(r.records[0].my_grid, "PM95uq");
        assert_eq!(r.mygrid, "PM95uq");
    }

    #[test]
    fn mygrid_accepts_four_six_and_eight_characters() {
        for (input, want) in [
            ("pm95", "PM95"),
            ("PM95uq", "PM95uq"),
            ("PM95uq12", "PM95uq12"),
        ] {
            let r = compile_fle(&format!("{HEAD}mygrid {input}\n0900 ja1xyz"));
            assert_eq!(r.records[0].my_grid, want, "{input}");
        }
    }

    #[test]
    fn an_invalid_grid_is_an_error() {
        for bad in ["XX99", "PM9", "PM95zz", "tokyo"] {
            let r = compile_fle(&format!("{HEAD}mygrid {bad}\n0900 ja1xyz"));
            assert!(
                r.errors.iter().any(|e| e.message.contains("grid")),
                "{bad}: {:?}",
                r.errors
            );
        }
        let missing = compile_fle(&format!("{HEAD}mygrid\n0900 ja1xyz"));
        assert!(!missing.errors.is_empty());
    }

    #[test]
    fn a_location_applies_from_its_line_on() {
        let r = compile_fle(&format!(
            "{HEAD}0900 ja1aaa\nmygrid PM95uq\nmysota JA/TK-001\n0910 ja1bbb"
        ));
        assert_eq!(
            (r.records[0].my_grid.as_str(), r.records[0].mysota.as_str()),
            ("", "")
        );
        assert_eq!(
            (r.records[1].my_grid.as_str(), r.records[1].mysota.as_str()),
            ("PM95uq", "JA/TK-001")
        );
    }

    #[test]
    fn a_location_directive_replaces_the_previous_one() {
        // 2か所目の公園で、1か所目の公園が残らない(同じ場所の公園は、同じ行に並べる)
        let r = compile_fle(&format!(
            "{HEAD}mypota JA-0001 JA-0002\n0900 ja1aaa\nmypota JA-0003\n0910 ja1bbb"
        ));
        assert_eq!(r.records[0].mypota, vec!["JA-0001", "JA-0002"]);
        assert_eq!(r.records[1].mypota, vec!["JA-0003"]);
        assert_eq!(r.mypota, vec!["JA-0003"]);
    }

    #[test]
    fn a_hyphen_clears_a_location_item() {
        let r = compile_fle(&format!(
            "{HEAD}mysota JA/TK-001\nmypota JA-0001\nmywwff JAFF-0001\nmygrid PM95uq\n0900 ja1aaa\nmysota -\nmypota -\nmywwff -\nmygrid -\n0910 ja1bbb"
        ));
        assert_eq!(r.status, "OK", "{:?}", r.errors);
        let (a, b) = (&r.records[0], &r.records[1]);
        assert_eq!(
            (a.mysota.as_str(), a.mywwff.as_str(), a.my_grid.as_str()),
            ("JA/TK-001", "JAFF-0001", "PM95uq")
        );
        assert_eq!(a.mypota, vec!["JA-0001"]);
        assert_eq!(
            (b.mysota.as_str(), b.mywwff.as_str(), b.my_grid.as_str()),
            ("", "", "")
        );
        assert!(b.mypota.is_empty());
    }

    #[test]
    fn locations_are_optional() {
        let r = compile_fle(&format!("{HEAD}0900 ja1xyz"));
        assert_eq!(r.status, "OK");
        assert_eq!(r.records[0].my_grid, "");
        assert!(r.records[0].mysota.is_empty() && r.records[0].mypota.is_empty());
    }

    #[test]
    fn an_invalid_pota_line_leaves_the_previous_value() {
        let r = compile_fle(&format!(
            "{HEAD}mypota JA-0001\nmypota nonsense\n0900 ja1xyz"
        ));
        assert!(!r.errors.is_empty());
        assert_eq!(r.records[0].mypota, vec!["JA-0001"]);
    }

    // ---- 数字で始まるコールサイン・タブ区切り(以前は黙って捨てられていた) ----

    #[test]
    fn qsos_with_digit_first_callsigns_are_recorded() {
        for call in ["7K1ABC", "8J1RL", "3B8CW", "9A1A", "7N4ABC/1"] {
            let r = compile_fle(&format!("{HEAD}0900 {}", call.to_lowercase()));
            assert_eq!(r.status, "OK", "{call}: {:?}", r.errors);
            assert_eq!(r.records.len(), 1, "{call}");
            assert_eq!(r.records[0].callsign, call);
        }
    }

    #[test]
    fn mycall_may_start_with_a_digit() {
        let r = compile_fle("mycall 7K1ABC/1\n40m cw\n0900 ja1xyz");
        assert!(r.errors.is_empty(), "{:?}", r.errors);
        assert_eq!(
            (r.mycall.as_str(), r.operator.as_str()),
            ("7K1ABC/1", "7K1ABC")
        );
    }

    #[test]
    fn tab_separated_lines_are_read_like_space_separated_ones() {
        let spaced = compile_fle(&format!("{HEAD}0900 ja1xyz 599 579"));
        let tabbed = compile_fle(&format!("{HEAD}0900\tja1xyz\t599\t579"));
        assert_eq!(tabbed.status, "OK", "{:?}", tabbed.errors);
        assert_eq!(tabbed.records.len(), 1);
        assert_eq!(
            (
                &tabbed.records[0].callsign,
                &tabbed.records[0].rst_sent,
                &tabbed.records[0].rst_rcvd
            ),
            (
                &spaced.records[0].callsign,
                &spaced.records[0].rst_sent,
                &spaced.records[0].rst_rcvd
            )
        );
    }

    #[test]
    fn directives_and_settings_may_be_tab_separated_too() {
        let r = compile_fle("mycall\tJA1ABC\ndate\t2026-10-18\n40m\tcw\n0900\tja1xyz");
        assert!(r.errors.is_empty(), "{:?}", r.errors);
        assert_eq!(r.records.len(), 1);
        assert_eq!(
            (r.mycall.as_str(), r.records[0].mode.as_str()),
            ("JA1ABC", "CW")
        );
    }

    // ---- rig(HAMLOG の Rig= の右辺)----

    #[test]
    fn rig_applies_from_its_line_and_can_be_cleared() {
        let r = compile_fle(
            "mycall JA1ABC\ndate 2026-10-18\n40m cw\n0900 ja1aaa\nrig KX2/IC-705+EFHW\n0910 ja1bbb\n0920 ja1ccc\nrig -\n0930 ja1ddd",
        );
        assert!(r.errors.is_empty(), "{:?}", r.errors);
        let rigs: Vec<&str> = r.records.iter().map(|q| q.rig.as_str()).collect();
        assert_eq!(rigs, ["", "KX2/IC-705+EFHW", "KX2/IC-705+EFHW", ""]);
    }

    #[test]
    fn dollar_rig_follows_the_rig_of_each_qso() {
        // qslmsg を書いたあとで rig を変えても、メッセージを書き直さなくてよい
        let r = compile_fle(
            "mycall JA1ABC\ndate 2026-10-18\n40m cw\nqslmsg TNX $rig\n0900 ja1aaa\nrig A\n0910 ja1bbb\nrig B\n0920 ja1ccc",
        );
        let msgs: Vec<&str> = r.records.iter().map(|q| q.qslmsg.as_str()).collect();
        assert_eq!(msgs, ["TNX", "TNX A", "TNX B"]);
    }

    #[test]
    fn rigset_is_an_error_that_points_to_rig() {
        let r = compile_fle("mycall JA1ABC\ndate 2026-10-18\n40m cw\nrigset 1\n0900 ja1aaa");
        assert_eq!(r.errors.len(), 1);
        assert_eq!(r.errors[0].code, "renamed_directive");
        assert_eq!(r.errors[0].args, ["rigset", "rig"]);
        assert_eq!(r.records[0].rig, ""); // QSO そのものは、記録される
    }

    #[test]
    fn timezone_jst_is_nine_hours_ahead_and_utc_is_zero() {
        let r = compile_fle("mycall JA1ABC\ndate 2026-10-18\ntimezone jst\n40m cw\n1805 ja1aaa\ntimezone utc\n1000 ja1bbb");
        assert!(r.errors.is_empty(), "{:?}", r.errors);
        // JST 18:05 は UTC 09:05。UTC の 10:00 は、そのまま
        assert_eq!(
            (r.records[0].hour, r.records[0].min, r.records[0].tz),
            (9, 5, 9)
        );
        assert_eq!(
            (r.records[1].hour, r.records[1].min, r.records[1].tz),
            (10, 0, 0)
        );
    }
}
