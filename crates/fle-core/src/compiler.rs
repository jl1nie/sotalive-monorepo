//! FLEコンパイラ
//!
//! トークン列をQSOレコードに変換するFSM実装

use chrono::{Datelike, Duration, NaiveDate, Timelike};

use super::tokenizer::{parse_callsign, tokenize, CommentKind, Token, TokenInfo};
use super::types::{FleCompileResult, FleEnvironment, FleQsoRecord, RstType, RstValue, MODE_TABLE};
use crate::ham::freq_to_band;

/// FSM状態
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum State {
    /// 通常状態: モード、バンド、周波数、時刻、コールサイン等を受け付ける
    Norm,
    /// バンドの後、周波数が続く可能性がある状態
    Freq,
    /// コールサイン後、送信RSTを待つ状態
    RstSent,
    /// 送信RST後、受信RSTを待つ状態
    RstRcvd,
}

/// ディレクティブ処理結果
enum DirectiveResult {
    /// ディレクティブとして処理した
    Handled,
    /// ディレクティブではない（QSO行として処理継続）
    NotDirective,
    /// エラー
    Error,
}

/// FLEテキストをコンパイル
pub fn compile_fle(input: &str) -> FleCompileResult {
    let mut env = FleEnvironment::default();
    let mut records: Vec<FleQsoRecord> = Vec::new();
    let mut has_sota = false;
    let mut has_wwff = false;
    let mut has_pota = false;
    let mut has_contest = false;

    for (line_num, line) in input.lines().enumerate() {
        // 空行はスキップ
        if line.trim().is_empty() {
            continue;
        }

        // 現在のQSO状態をリセット
        env.reset_current_qso();

        // トークン化
        let tokens = tokenize(line);
        if tokens.is_empty() {
            continue;
        }

        // ディレクティブ処理を試行
        match process_directive(&tokens, &mut env, line_num, line) {
            DirectiveResult::Handled => {
                // フラグ更新
                if !env.mysota.is_empty() {
                    has_sota = true;
                }
                if !env.mywwff.is_empty() {
                    has_wwff = true;
                }
                if !env.mypota.is_empty() {
                    has_pota = true;
                }
                if env.contest_num.is_some() || env.contest_lit.is_some() {
                    has_contest = true;
                }
                continue;
            }
            DirectiveResult::Error => continue,
            DirectiveResult::NotDirective => {}
        }

        // QSO行として処理
        if let Some(record) = process_qso_line(&tokens, &mut env, line_num) {
            records.push(record);
        }
    }

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
        qslmsg: env.qslmsg.clone(),
        records,
        errors: env.errors,
        has_sota,
        has_wwff,
        has_pota,
        has_contest,
    }
}

/// ディレクティブを処理
fn process_directive(
    tokens: &[TokenInfo],
    env: &mut FleEnvironment,
    line_num: usize,
    _line: &str,
) -> DirectiveResult {
    if tokens.is_empty() {
        return DirectiveResult::NotDirective;
    }

    let first = &tokens[0];
    if let Token::Keyword { key, .. } = &first.token {
        match key.as_str() {
            "mycall" => {
                if tokens.len() > 1 {
                    if let Token::Call(call) = &tokens[1].token {
                        env.mycall = call.clone();
                        if let Some((_, base, _, _)) = parse_callsign(call) {
                            env.operator = base;
                        }
                    } else {
                        env.add_error(line_num, 1, "Invalid callsign.");
                    }
                } else {
                    env.add_error(line_num, 0, "Missing operand.");
                }
                DirectiveResult::Handled
            }
            "operator" => {
                if tokens.len() > 1 {
                    if let Token::Call(call) = &tokens[1].token {
                        env.operator = call.clone();
                    } else {
                        env.add_error(line_num, 1, "Invalid operator.");
                    }
                } else {
                    env.add_error(line_num, 0, "Missing operand.");
                }
                DirectiveResult::Handled
            }
            "mysota" => {
                if tokens.len() > 1 {
                    if is_clear(&tokens[1]) {
                        env.mysota.clear();
                    } else if let Token::SotaRef(r) = &tokens[1].token {
                        env.mysota = r.clone();
                    } else {
                        let raw = &tokens[1].raw;
                        env.add_error(line_num, 1, format!("{} is invalid SOTA ref#.", raw));
                    }
                } else {
                    env.add_error(line_num, 0, "Missing SOTA ref#.");
                }
                DirectiveResult::Handled
            }
            "mywwff" => {
                if tokens.len() > 1 {
                    if is_clear(&tokens[1]) {
                        env.mywwff.clear();
                    } else if let Token::WwffRef(r) = &tokens[1].token {
                        env.mywwff = r.clone();
                    } else {
                        let raw = &tokens[1].raw;
                        env.add_error(line_num, 1, format!("{} is invalid WWFF ref#.", raw));
                    }
                } else {
                    env.add_error(line_num, 0, "Missing WWFF ref#.");
                }
                DirectiveResult::Handled
            }
            "mypota" => {
                // 行に並べた公園が、そのときの運用場所のすべて(前の指定は置き換える)
                if tokens.len() > 1 {
                    if is_clear(&tokens[1]) {
                        env.mypota.clear();
                    } else {
                        let mut refs = Vec::new();
                        let mut failed = false;
                        for token_info in &tokens[1..] {
                            if let Token::PotaRef(r) = &token_info.token {
                                refs.push(r.clone());
                            } else {
                                let raw = &token_info.raw;
                                env.add_error(
                                    line_num,
                                    token_info.position,
                                    format!("{} is invalid POTA ref#.", raw),
                                );
                                failed = true;
                                break;
                            }
                        }
                        // 誤りがあれば、前の指定を残す
                        if !failed {
                            env.mypota = refs;
                        }
                    }
                } else {
                    env.add_error(line_num, 0, "Missing POTA ref#.");
                }
                DirectiveResult::Handled
            }
            "mygrid" => {
                if tokens.len() > 1 {
                    if is_clear(&tokens[1]) {
                        env.mygrid.clear();
                    } else if let Some(grid) = canonical_grid(&tokens[1].raw) {
                        env.mygrid = grid;
                    } else {
                        let raw = &tokens[1].raw;
                        env.add_error(line_num, 1, format!("{} is invalid grid locator.", raw));
                    }
                } else {
                    env.add_error(line_num, 0, "Missing grid locator.");
                }
                DirectiveResult::Handled
            }
            "date" => {
                if tokens.len() > 1 {
                    match &tokens[1].token {
                        Token::Date { year, month, day } => {
                            if validate_date(*year, *month, *day) {
                                env.year = *year;
                                env.month = *month;
                                env.day = *day;
                                env.current.year = *year;
                                env.current.month = *month;
                                env.current.day = *day;
                                env.current.hour = 0;
                                env.current.min = 0;
                            } else {
                                env.add_error(line_num, 1, "Date out of range.");
                            }
                        }
                        Token::Date2 { month, day } => {
                            if validate_date(env.year, *month, *day) {
                                env.month = *month;
                                env.day = *day;
                                env.current.month = *month;
                                env.current.day = *day;
                                env.current.hour = 0;
                                env.current.min = 0;
                            } else {
                                env.add_error(line_num, 1, "Date out of range.");
                            }
                        }
                        _ => {
                            env.add_error(line_num, 1, "Wrong date format.");
                        }
                    }
                } else {
                    env.add_error(line_num, 0, "Missing operand.");
                }
                DirectiveResult::Handled
            }
            "day" => {
                if tokens.len() > 1 {
                    if let Token::Literal(lit) = &tokens[1].token {
                        let days = match lit.as_str() {
                            "+" => 1,
                            "++" => 2,
                            _ => {
                                env.add_error(line_num, 1, "Unknown operand.");
                                return DirectiveResult::Error;
                            }
                        };
                        if let Some(date) = NaiveDate::from_ymd_opt(
                            env.year as i32,
                            env.month as u32,
                            env.day as u32,
                        ) {
                            let new_date = date + Duration::days(days);
                            // 基準日付とカレント日付の両方を更新
                            env.year = new_date.year() as u16;
                            env.month = new_date.month() as u8;
                            env.day = new_date.day() as u8;
                            env.current.year = new_date.year() as u16;
                            env.current.month = new_date.month() as u8;
                            env.current.day = new_date.day() as u8;
                            env.current.hour = 0;
                            env.current.min = 0;
                        } else {
                            env.add_error(line_num, 1, "Date out of range.");
                        }
                    } else {
                        env.add_error(line_num, 1, "Missing operand +/++.");
                    }
                } else {
                    env.add_error(line_num, 0, "Missing operand +/++.");
                }
                DirectiveResult::Handled
            }
            "timezone" => {
                if tokens.len() > 1 {
                    if let Token::Snr(tz) = &tokens[1].token {
                        if let Ok(offset) = tz.parse::<i32>() {
                            env.timezone = Some(offset);
                        } else {
                            env.add_error(line_num, 1, format!("{} is invalid timezone.", tz));
                        }
                    } else {
                        let raw = &tokens[1].raw;
                        env.add_error(line_num, 1, format!("{} is invalid timezone.", raw));
                    }
                } else {
                    env.add_error(line_num, 0, "Missing timezone. (eg. +9)");
                }
                DirectiveResult::Handled
            }
            "nickname" => {
                if tokens.len() > 1 {
                    env.nickname = tokens[1].raw.clone();
                } else {
                    env.add_error(line_num, 0, "Missing operand.");
                }
                DirectiveResult::Handled
            }
            "rigset" => {
                if tokens.len() > 1 {
                    if let Token::Decimal { value, .. } = &tokens[1].token {
                        if let Ok(v) = value.parse::<u8>() {
                            env.rigset = v;
                            env.current.rigset = v;
                        } else {
                            env.add_error(line_num, 1, "Invalid Rig set#.");
                        }
                    } else {
                        env.add_error(line_num, 1, "Invalid Rig set#.");
                    }
                } else {
                    env.add_error(line_num, 0, "Missing operand.");
                }
                DirectiveResult::Handled
            }
            "number" => {
                if tokens.len() > 1 {
                    if let Token::Keyword { key, .. } = &tokens[1].token {
                        if key == "consecutive" {
                            env.contest_num = Some(1);
                        }
                    } else {
                        env.contest_lit = Some(tokens[1].raw.to_uppercase());
                    }
                } else {
                    env.add_error(line_num, 0, "Missing operand.");
                }
                DirectiveResult::Handled
            }
            "qslmsg" => {
                // 行の残りをQSLメッセージとして取得
                if tokens.len() > 1 {
                    let msg: Vec<String> = tokens[1..].iter().map(|t| t.raw.clone()).collect();
                    let mut qslmsg = msg.join(" ");
                    // 変数置換
                    qslmsg = qslmsg.replace("$mywwff", &env.mywwff);
                    qslmsg = qslmsg.replace("$mysota", &env.mysota);
                    qslmsg = qslmsg.replace("$mypota", &env.mypota.join(" "));
                    env.qslmsg = qslmsg;
                }
                DirectiveResult::Handled
            }
            "qslmsg2" => {
                if tokens.len() > 1 {
                    let msg: Vec<String> = tokens[1..].iter().map(|t| t.raw.clone()).collect();
                    env.qslmsg2 = msg.join(" ");
                }
                DirectiveResult::Handled
            }
            _ => DirectiveResult::NotDirective,
        }
    } else {
        DirectiveResult::NotDirective
    }
}

/// QSO行を処理
fn process_qso_line(
    tokens: &[TokenInfo],
    env: &mut FleEnvironment,
    line_num: usize,
) -> Option<FleQsoRecord> {
    let mut state = State::Norm;
    let mut pos = 0;

    // 現在の日時を環境から継承
    env.current.year = env.year;
    env.current.month = env.month;
    env.current.day = env.day;

    while pos < tokens.len() {
        let token_info = &tokens[pos];
        let token = &token_info.token;

        // コメントは状態に関係なく処理
        if let Token::Comment { kind, content } = token {
            match kind {
                CommentKind::Angle => env.current.qso_msg = content.clone(),
                CommentKind::Square => env.current.qsl_msg = content.clone(),
                CommentKind::Curly => env.current.qso_rmks = content.clone(),
            }
            pos += 1;
            continue;
        }

        match state {
            State::Norm => {
                match token {
                    Token::Mode(m) => {
                        env.current.mode = m.clone();
                    }
                    Token::Band { band, freq } => {
                        env.current.band = band.clone();
                        env.current.freq = freq.clone();
                        state = State::Freq;
                    }
                    Token::Freq(f) => {
                        env.current.freq = f.clone();
                        if let Ok((_, _, band)) = freq_to_band(f) {
                            env.current.band = band.to_string();
                        } else {
                            env.add_error(line_num, pos, "Unknown band.");
                        }
                    }
                    Token::Decimal { digits, value } => {
                        // 時刻処理
                        process_time(env, *digits, value);
                    }
                    Token::Call(call) => {
                        if !env.current.call.is_empty() {
                            env.add_error(
                                line_num,
                                pos,
                                format!("Each line must contains only one callsign: {}", call),
                            );
                        }
                        if env.current.band.is_empty() && env.current.freq.is_empty() {
                            env.add_error(
                                line_num,
                                pos,
                                "Band or frequency must be specified before QSO.",
                            );
                        }
                        env.current.call = call.clone();
                        // RSTのデフォルト値を設定
                        set_default_rst(env);
                        state = State::RstSent;
                    }
                    Token::WwffRef(r) => {
                        env.current.his_wwff = r.clone();
                    }
                    Token::SotaRef(r) => {
                        env.current.his_sota = r.clone();
                    }
                    Token::PotaRef(r) => {
                        env.current.his_pota.push(r.clone());
                    }
                    Token::ContestSent(num) => {
                        // コンテスト送信番号
                        if let Some(contest_num) = &mut env.contest_num {
                            if let Ok(n) = num.parse::<u32>() {
                                env.current.his_num = format!("{:03}", n);
                                *contest_num = n + 1;
                            }
                        } else if env.contest_lit.is_some() {
                            env.current.his_num = num.to_uppercase();
                        }
                    }
                    Token::ContestRcvd(num) => {
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
                    Token::Literal(lit) => {
                        env.current.qso_msg = lit.clone();
                        // 次のリテラルがあれば備考
                        if pos + 1 < tokens.len() {
                            if let Token::Literal(rmks) = &tokens[pos + 1].token {
                                env.current.qso_rmks = rmks.clone();
                                pos += 1;
                            }
                        }
                    }
                    Token::Unknown(u) => {
                        env.add_error(line_num, pos, format!("Unknown literal: {}", u));
                    }
                    _ => {}
                }
                pos += 1;
            }
            State::Freq => {
                // 周波数が続くかチェック
                if let Token::Freq(f) = token {
                    env.current.freq = f.clone();
                    if let Ok((_, _, band)) = freq_to_band(f) {
                        env.current.band = band.to_string();
                    } else {
                        env.add_error(line_num, pos, "Out of the band.");
                    }
                    pos += 1;
                }
                state = State::Norm;
            }
            State::RstSent => {
                match token {
                    Token::Decimal { digits, value } => {
                        let v: u32 = value.parse().unwrap_or(59);
                        env.current.rst_sent = RstValue::parse_rst(v, *digits);
                        pos += 1;
                        state = State::RstRcvd;
                    }
                    Token::Snr(s) => {
                        env.current.rst_sent = RstValue::Snr(s.clone());
                        pos += 1;
                        state = State::RstRcvd;
                    }
                    _ => {
                        // RSTなしで次へ
                        state = State::Norm;
                    }
                }
            }
            State::RstRcvd => {
                match token {
                    Token::Decimal { digits, value } => {
                        let v: u32 = value.parse().unwrap_or(59);
                        env.current.rst_rcvd = RstValue::parse_rst(v, *digits);
                        pos += 1;
                    }
                    Token::Snr(s) => {
                        env.current.rst_rcvd = RstValue::Snr(s.clone());
                        pos += 1;
                    }
                    _ => {}
                }
                state = State::Norm;
            }
        }
    }

    // コールサインがあればQSOレコードを生成
    if !env.current.call.is_empty() {
        // UTC変換
        let utc = env.to_utc();

        Some(FleQsoRecord {
            line: line_num,
            tz: env.timezone.unwrap_or(0),
            mycall: env.mycall.clone(),
            operator: env.operator.clone(),
            year: utc.date().year() as u16,
            month: utc.date().month() as u8,
            day: utc.date().day() as u8,
            hour: utc.time().hour() as u8,
            min: utc.time().minute() as u8,
            callsign: env.current.call.clone(),
            band: env.current.band.clone(),
            freq: env.current.freq.clone(),
            mode: env.current.mode.clone(),
            rigset: env.current.rigset,
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
            qsomsg: env.current.qso_msg.clone(),
            qsormks: env.current.qso_rmks.clone(),
            qslmsg: env.qslmsg.clone(),
        })
    } else {
        None
    }
}

/// 時刻を処理
/// 運用場所の指定を解除する値(`-`)か
fn is_clear(token: &TokenInfo) -> bool {
    token.raw == "-"
}

/// メイデンヘッドのグリッドロケータを、慣例の書き方(`PM95uq`)にそろえる。
/// 4・6・8文字(AA00 / AA00aa / AA00aa00)だけを受け付ける。
pub fn canonical_grid(raw: &str) -> Option<String> {
    let chars: Vec<char> = raw.chars().collect();
    if !matches!(chars.len(), 4 | 6 | 8) || !chars.iter().all(char::is_ascii_alphanumeric) {
        return None;
    }
    let letter = |c: char, last: char| c.is_ascii_alphabetic() && c.to_ascii_uppercase() <= last;
    let ok = letter(chars[0], 'R')
        && letter(chars[1], 'R')
        && chars[2].is_ascii_digit()
        && chars[3].is_ascii_digit()
        && (chars.len() < 6 || (letter(chars[4], 'X') && letter(chars[5], 'X')))
        && (chars.len() < 8 || (chars[6].is_ascii_digit() && chars[7].is_ascii_digit()));
    if !ok {
        return None;
    }
    Some(
        chars
            .iter()
            .enumerate()
            .map(|(i, c)| {
                if i < 2 {
                    c.to_ascii_uppercase()
                } else {
                    c.to_ascii_lowercase()
                }
            })
            .collect(),
    )
}

fn process_time(env: &mut FleEnvironment, digits: usize, value: &str) {
    let v: u32 = value.parse().unwrap_or(0);
    match digits {
        1 => {
            // 1桁: 分の1の位
            env.current.min = (env.current.min / 10) * 10 + (v % 10) as u8;
        }
        2 => {
            // 2桁: 分
            env.current.min = (v % 60) as u8;
        }
        3 => {
            // 3桁: H:MM
            let h = (v / 100) as u8;
            let m = (v % 100 % 60) as u8;
            env.current.hour = (env.current.hour / 10) * 10 + h;
            env.current.min = m;
        }
        4 => {
            // 4桁: HH:MM
            let h = (v / 100) as u8;
            let m = (v % 100 % 60) as u8;
            env.current.hour = h;
            env.current.min = m;
        }
        _ => {}
    }
}

/// デフォルトRSTを設定
fn set_default_rst(env: &mut FleEnvironment) {
    let mode_lower = env.current.mode.to_lowercase();
    let rst_type = MODE_TABLE
        .get(mode_lower.as_str())
        .copied()
        .unwrap_or(RstType::Rst);

    let default = match rst_type {
        RstType::Rst => RstValue::default(),
        RstType::Rs => RstValue::default_rs(),
        RstType::Snr => RstValue::default_snr(),
    };
    env.current.rst_sent = default.clone();
    env.current.rst_rcvd = default;
}

/// 日付を検証
fn validate_date(year: u16, month: u8, day: u8) -> bool {
    (1900..=2100).contains(&year) && (1..=12).contains(&month) && (1..=31).contains(&day)
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
}
