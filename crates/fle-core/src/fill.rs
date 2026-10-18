//! 補完結果の確定。入力中の行に足りない要素を、テキストの修正(`Edit`)として返す。
//!
//! 補完した結果はログのテキストに書き込んで残す(開き直しても、再解釈しても同じになる)。
//! コアは時計を持たない。「いまの時刻」は呼び出し側から受け取る。
//!
//! v1 で確定するもの: 時刻のない QSO 行の、行頭の時刻(`HHMM `)。
//! 時刻の書式は、ログの `timezone` 指定に従う(なければ UTC)。

use chrono::{DateTime, Duration};
use serde::Serialize;

use crate::compiler::compile_fle;
use crate::tokenizer::{tokenize, Token};

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

/// `line`(0始まり)の行を確定する。直すところがなければ空を返す。同じ入力を適用した後に
/// 再び呼んでも、空になる。
///
/// - `now_ms`: いまの時刻(UNIX時刻のミリ秒。UTC)
/// - `default_tz`: 設定の既定のタイムゾーン(UTCからの時間差。UTC は 0)
pub fn fill(text: &str, line: usize, now_ms: i64, default_tz: i32) -> Vec<Edit> {
    let lines: Vec<&str> = text.split('\n').collect();
    let Some(target) = lines.get(line) else {
        return Vec::new();
    };
    if !is_qso_without_time(target) {
        return Vec::new();
    }
    let Some(now) = DateTime::from_timestamp_millis(now_ms) else {
        return Vec::new();
    };

    // 時刻の意味(タイムゾーン)は、ログで最初に決まったものに従う
    let (tz, tz_edit) = match timezone_before(&lines[..line]) {
        Some(tz) => (tz, None),
        None if default_tz != 0 && !has_qso_before(text, line) => {
            (default_tz, Some(format!("timezone {:+}\n", default_tz)))
        }
        None => (0, None),
    };

    let hhmm = (now + Duration::hours(i64::from(tz))).format("%H%M");
    let at = line_start_utf16(&lines, line) + leading_spaces_utf16(target);

    match tz_edit {
        // 先頭行の行頭に両方入るときは、同じ位置に2つ入れず1つにまとめる
        Some(tz_line) if at == 0 => vec![Edit {
            from: 0,
            to: 0,
            insert: format!("{tz_line}{hhmm} "),
        }],
        Some(tz_line) => vec![
            Edit {
                from: 0,
                to: 0,
                insert: tz_line,
            },
            Edit {
                from: at,
                to: at,
                insert: format!("{hhmm} "),
            },
        ],
        None => vec![Edit {
            from: at,
            to: at,
            insert: format!("{hhmm} "),
        }],
    }
}

/// コールサインから始まる行(= 時刻を省いた QSO 行)か
fn is_qso_without_time(line: &str) -> bool {
    let tokens = tokenize(line.trim());
    matches!(tokens.first().map(|t| &t.token), Some(Token::Call(_)))
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
}
