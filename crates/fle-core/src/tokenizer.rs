//! FLEトークナイザー
//!
//! FLE形式のテキストをトークン列に変換する。

use once_cell::sync::Lazy;
use regex::Regex;

use super::types::{KEYWORD_TABLE, MODE_TABLE};
use crate::ham::band_to_freq;

/// トークン型
#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    /// 日付 (year, month, day)
    Date { year: u16, month: u8, day: u8 },
    /// 日付 (月日のみ)
    Date2 { month: u8, day: u8 },
    /// 周波数 (MHz)
    Freq(String),
    /// バンド
    Band { band: String, freq: String },
    /// S/N比
    Snr(String),
    /// WWFFリファレンス
    WwffRef(String),
    /// SOTAリファレンス
    SotaRef(String),
    /// POTAリファレンス
    PotaRef(String),
    /// キーワード (key, arg_count)
    Keyword { key: String, arg_count: i8 },
    /// モード
    Mode(String),
    /// コールサイン
    Call(String),
    /// 10進数 (digits, value)
    Decimal { digits: usize, value: String },
    /// コメント (種別, 内容)
    Comment { kind: CommentKind, content: String },
    /// コンテスト送信番号
    ContestSent(String),
    /// コンテスト受信番号
    ContestRcvd(String),
    /// リテラル
    Literal(String),
    /// 不明
    Unknown(String),
}

/// コメント種別
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommentKind {
    /// <...> - QSOメッセージ
    Angle,
    /// [...] - QSLメッセージ
    Square,
    /// {...} - 備考
    Curly,
}

/// トークンと位置情報
#[derive(Debug, Clone)]
pub struct TokenInfo {
    pub token: Token,
    pub position: usize,
    pub raw: String,
}

// 正規表現パターン
static RE_DATE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(\d+)[/-](\d+)[/-](\d+)$").unwrap());
static RE_DATE2: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(\d+)[/-](\d+)$").unwrap());
static RE_FREQ: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\d+\.\d+$").unwrap());
static RE_SNR: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[+-]\d+$").unwrap());
static RE_WWFF: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\w+FF-\d+$").unwrap());
static RE_SOTA: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\w+/\w+-\d+$").unwrap());
static RE_POTA: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\w+-\d+$").unwrap());
static RE_DECIMAL: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\d+$").unwrap());
static RE_CONTEST_SENT: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\.\w+").unwrap());
static RE_CONTEST_RCVD: Lazy<Regex> = Lazy::new(|| Regex::new(r"^,\w+").unwrap());
static RE_CALLSIGN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[A-Z]{1,3}[0-9][A-Z0-9]*[A-Z]$").unwrap());
static RE_CALLSIGN_PORTABLE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[A-Z0-9]+/[A-Z0-9]+(/[A-Z0-9]+)?$").unwrap());
static RE_UNKNOWN_REF: Lazy<Regex> = Lazy::new(|| Regex::new(r".*[/\-]+.*").unwrap());

/// 1行をトークン化
pub fn tokenize(line: &str) -> Vec<TokenInfo> {
    let mut tokens = Vec::new();
    let mut pos = 0;
    let chars: Vec<char> = line.chars().collect();
    let _line_upper = line.to_uppercase();

    while pos < chars.len() {
        // 空白をスキップ
        if chars[pos] == ' ' || chars[pos] == '\u{3000}' {
            pos += 1;
            continue;
        }

        // コメント開始
        if chars[pos] == '#' {
            break;
        }

        // 括弧コメント
        if chars[pos] == '<' || chars[pos] == '[' || chars[pos] == '{' {
            let kind = match chars[pos] {
                '<' => CommentKind::Angle,
                '[' => CommentKind::Square,
                '{' => CommentKind::Curly,
                _ => unreachable!(),
            };
            let close = match kind {
                CommentKind::Angle => '>',
                CommentKind::Square => ']',
                CommentKind::Curly => '}',
            };
            let start = pos;
            let mut raw = String::new();
            raw.push(chars[pos]);
            pos += 1;
            let mut content = String::new();
            while pos < chars.len() && chars[pos] != close {
                content.push(chars[pos]);
                raw.push(chars[pos]);
                pos += 1;
            }
            if pos < chars.len() {
                raw.push(chars[pos]);
                pos += 1; // close bracket
            }
            tokens.push(TokenInfo {
                token: Token::Comment { kind, content },
                position: start,
                raw,
            });
            continue;
        }

        // トークンを抽出
        let start = pos;
        let mut word = String::new();
        while pos < chars.len()
            && chars[pos] != ' '
            && chars[pos] != '\u{3000}'
            && !matches!(chars[pos], '#' | '<' | '[' | '{')
        {
            word.push(chars[pos]);
            pos += 1;
        }

        if word.is_empty() {
            continue;
        }

        let word_upper = word.to_uppercase();
        let token = classify_token(&word, &word_upper, line);

        tokens.push(TokenInfo {
            token,
            position: start,
            raw: word,
        });
    }

    tokens
}

/// トークンを分類
fn classify_token(word: &str, word_upper: &str, _line: &str) -> Token {
    // 日付 (YYYY-MM-DD or YYYY/MM/DD)
    if let Some(caps) = RE_DATE.captures(word_upper) {
        let year: u16 = caps[1].parse().unwrap_or(2000);
        let month: u8 = caps[2].parse().unwrap_or(1);
        let day: u8 = caps[3].parse().unwrap_or(1);
        return Token::Date { year, month, day };
    }

    // 日付 (MM-DD or MM/DD)
    if let Some(caps) = RE_DATE2.captures(word_upper) {
        let month: u8 = caps[1].parse().unwrap_or(1);
        let day: u8 = caps[2].parse().unwrap_or(1);
        return Token::Date2 { month, day };
    }

    // 周波数 (7.025)
    if RE_FREQ.is_match(word_upper) {
        return Token::Freq(word.to_string());
    }

    // S/N比 (+10, -15)
    if RE_SNR.is_match(word_upper) {
        return Token::Snr(word.to_string());
    }

    // バンド (40m, 2m, etc.)
    if let Some(freq) = band_to_freq(word, true) {
        return Token::Band {
            band: word.to_string(),
            freq: freq.to_string(),
        };
    }

    // WWFFリファレンス
    if RE_WWFF.is_match(word_upper) {
        return Token::WwffRef(word_upper.to_string());
    }

    // SOTAリファレンス
    if RE_SOTA.is_match(word_upper) {
        return Token::SotaRef(word_upper.to_string());
    }

    // POTAリファレンス (WWFFとSOTAにマッチしなかった場合)
    if RE_POTA.is_match(word_upper) && !RE_WWFF.is_match(word_upper) {
        return Token::PotaRef(word_upper.to_string());
    }

    // キーワード
    if let Some(&arg_count) = KEYWORD_TABLE.get(word_upper.to_lowercase().as_str()) {
        // QSLMSGは行末まで取得
        if word_upper == "QSLMSG" || word_upper == "QSLMSG2" {
            return Token::Keyword {
                key: word_upper.to_lowercase(),
                arg_count: -1,
            };
        }
        return Token::Keyword {
            key: word_upper.to_lowercase(),
            arg_count,
        };
    }

    // モード
    if MODE_TABLE.contains_key(word_upper.to_lowercase().as_str()) {
        return Token::Mode(word_upper.to_string());
    }

    // 10進数
    if RE_DECIMAL.is_match(word_upper) {
        return Token::Decimal {
            digits: word.len(),
            value: word.to_string(),
        };
    }

    // コールサイン
    if is_callsign(word_upper) {
        return Token::Call(word_upper.to_string());
    }

    // コンテスト送信番号 (.XXX)
    if RE_CONTEST_SENT.is_match(word_upper) {
        return Token::ContestSent(word_upper[1..].to_string());
    }

    // コンテスト受信番号 (,XXX)
    if RE_CONTEST_RCVD.is_match(word_upper) {
        return Token::ContestRcvd(word_upper[1..].to_string());
    }

    // 不明なリファレンス風の文字列
    if RE_UNKNOWN_REF.is_match(word_upper) {
        return Token::Unknown(word_upper.to_string());
    }

    // リテラル
    Token::Literal(word_upper.to_string())
}

/// コールサインかどうか判定
fn is_callsign(s: &str) -> bool {
    // 単純なコールサイン
    if RE_CALLSIGN.is_match(s) {
        return true;
    }

    // ポータブル等
    if RE_CALLSIGN_PORTABLE.is_match(s) {
        // 少なくとも1つの部分がコールサインパターンにマッチすること
        for part in s.split('/') {
            if RE_CALLSIGN.is_match(part) {
                return true;
            }
        }
    }

    false
}

/// コールサインをパース (callsign, base_call, portable, qrp)
pub fn parse_callsign(call: &str) -> Option<(String, String, String, String)> {
    let call_upper = call.to_uppercase();
    let parts: Vec<&str> = call_upper.split('/').collect();

    match parts.len() {
        1 => {
            if RE_CALLSIGN.is_match(&call_upper) {
                Some((call_upper.clone(), call_upper, String::new(), String::new()))
            } else {
                None
            }
        }
        2 => {
            let (a, b) = (parts[0], parts[1]);
            // CALL/N (エリア番号)
            if RE_CALLSIGN.is_match(a) && b.len() == 1 && b.chars().next().unwrap().is_numeric() {
                return Some((
                    call_upper.clone(),
                    a.to_string(),
                    b.to_string(),
                    String::new(),
                ));
            }
            // CALL/P or CALL/QRP
            if RE_CALLSIGN.is_match(a) {
                if b == "P" {
                    return Some((
                        call_upper.clone(),
                        a.to_string(),
                        "P".to_string(),
                        String::new(),
                    ));
                }
                if b == "QRP" {
                    return Some((
                        call_upper.clone(),
                        a.to_string(),
                        String::new(),
                        "QRP".to_string(),
                    ));
                }
                // PREFIX/CALL
                return Some((
                    call_upper.clone(),
                    a.to_string(),
                    b.to_string(),
                    String::new(),
                ));
            }
            // PREFIX/CALL
            if RE_CALLSIGN.is_match(b) {
                return Some((
                    call_upper.clone(),
                    b.to_string(),
                    a.to_string(),
                    String::new(),
                ));
            }
            None
        }
        3 => {
            // PREFIX/CALL/P or CALL/N/P
            let (a, b, c) = (parts[0], parts[1], parts[2]);
            if RE_CALLSIGN.is_match(a) && (c == "P" || c == "QRP") {
                let qrp = if c == "QRP" { "QRP" } else { "" };
                let portable = if c == "P" { "P" } else { b };
                return Some((
                    call_upper.clone(),
                    a.to_string(),
                    portable.to_string(),
                    qrp.to_string(),
                ));
            }
            if RE_CALLSIGN.is_match(b) {
                let qrp = if c == "QRP" { "QRP" } else { "" };
                return Some((
                    call_upper.clone(),
                    b.to_string(),
                    a.to_string(),
                    qrp.to_string(),
                ));
            }
            None
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenize_basic() {
        let tokens = tokenize("40m cw JA1ABC 599 599");
        assert_eq!(tokens.len(), 5);
        assert!(matches!(&tokens[0].token, Token::Band { band, .. } if band == "40m"));
        assert!(matches!(&tokens[1].token, Token::Mode(m) if m == "CW"));
        assert!(matches!(&tokens[2].token, Token::Call(c) if c == "JA1ABC"));
    }

    #[test]
    fn test_tokenize_date() {
        let tokens = tokenize("date 2024-01-15");
        assert_eq!(tokens.len(), 2);
        assert!(matches!(&tokens[0].token, Token::Keyword { key, .. } if key == "date"));
        assert!(matches!(
            &tokens[1].token,
            Token::Date {
                year: 2024,
                month: 1,
                day: 15
            }
        ));
    }

    #[test]
    fn test_tokenize_refs() {
        let tokens = tokenize("mysota JA/TK-001 mypota JA-0001");
        assert_eq!(tokens.len(), 4);
        assert!(matches!(&tokens[1].token, Token::SotaRef(r) if r == "JA/TK-001"));
        assert!(matches!(&tokens[3].token, Token::PotaRef(r) if r == "JA-0001"));
    }

    #[test]
    fn test_tokenize_comment() {
        let tokens = tokenize("JA1ABC <John>");
        assert_eq!(tokens.len(), 2);
        assert!(
            matches!(&tokens[1].token, Token::Comment { kind: CommentKind::Angle, content } if content == "John")
        );
    }

    #[test]
    fn test_tokenize_freq() {
        let tokens = tokenize("7.025");
        assert_eq!(tokens.len(), 1);
        assert!(matches!(&tokens[0].token, Token::Freq(f) if f == "7.025"));
    }

    #[test]
    fn test_tokenize_snr() {
        let tokens = tokenize("FT8 +10 -15");
        assert_eq!(tokens.len(), 3);
        assert!(matches!(&tokens[0].token, Token::Mode(m) if m == "FT8"));
        assert!(matches!(&tokens[1].token, Token::Snr(s) if s == "+10"));
        assert!(matches!(&tokens[2].token, Token::Snr(s) if s == "-15"));
    }

    #[test]
    fn test_parse_callsign() {
        assert_eq!(
            parse_callsign("JA1ABC"),
            Some((
                "JA1ABC".to_string(),
                "JA1ABC".to_string(),
                String::new(),
                String::new()
            ))
        );
        assert_eq!(
            parse_callsign("JA1ABC/1"),
            Some((
                "JA1ABC/1".to_string(),
                "JA1ABC".to_string(),
                "1".to_string(),
                String::new()
            ))
        );
        assert_eq!(
            parse_callsign("JA1ABC/P"),
            Some((
                "JA1ABC/P".to_string(),
                "JA1ABC".to_string(),
                "P".to_string(),
                String::new()
            ))
        );
        assert_eq!(
            parse_callsign("JA1ABC/QRP"),
            Some((
                "JA1ABC/QRP".to_string(),
                "JA1ABC".to_string(),
                String::new(),
                "QRP".to_string()
            ))
        );
    }

    #[test]
    fn test_is_callsign() {
        assert!(is_callsign("JA1ABC"));
        assert!(is_callsign("W1AW"));
        assert!(is_callsign("VK2ABC"));
        assert!(!is_callsign("40M"));
        assert!(!is_callsign("CW"));
    }

    #[test]
    fn test_tokenize_japanese_comments() {
        // マルチバイト文字を含むコメントでパニックしないことを確認
        let tokens = tokenize("4 ja4qru 6 7 <曽田さん>{島根市}");
        assert_eq!(tokens.len(), 6);
        assert!(matches!(&tokens[0].token, Token::Decimal { value, .. } if value == "4"));
        assert!(matches!(&tokens[1].token, Token::Call(c) if c == "JA4QRU"));
        assert!(matches!(&tokens[2].token, Token::Decimal { value, .. } if value == "6"));
        assert!(matches!(&tokens[3].token, Token::Decimal { value, .. } if value == "7"));
        assert!(
            matches!(&tokens[4].token, Token::Comment { kind: CommentKind::Angle, content } if content == "曽田さん")
        );
        assert_eq!(tokens[4].raw, "<曽田さん>");
        assert!(
            matches!(&tokens[5].token, Token::Comment { kind: CommentKind::Curly, content } if content == "島根市")
        );
        assert_eq!(tokens[5].raw, "{島根市}");
    }
}
