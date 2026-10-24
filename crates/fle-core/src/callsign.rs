//! コールサインの判定と分解(ITU形式)。正規表現を使わない。
//!
//! 接頭辞は、英字1〜3文字(JA、W、VK など)か、数字 + 英字1〜2文字(7K、8J、3B、9A、4X、3DA など)。
//! そのあとに数字、英数字、最後は英字。`/` で区切った部分のどれかが、これに合えばよい(ポータブル)。

fn is_upper(c: char) -> bool {
    c.is_ascii_uppercase()
}

/// 数字 + 英数字 + 最後は英字(最低2文字)
fn tail_ok(rest: &[char]) -> bool {
    rest.len() >= 2
        && rest[0].is_ascii_digit()
        && rest[1..].iter().all(|c| is_upper(*c) || c.is_ascii_digit())
        && rest.last().is_some_and(|c| is_upper(*c))
}

/// 単独のコールサイン(大文字にしたもの)か
pub fn is_plain_call(s: &str) -> bool {
    let b: Vec<char> = s.chars().collect();
    let letters_first =
        (1..=3).any(|n| b.len() > n && b[..n].iter().all(|c| is_upper(*c)) && tail_ok(&b[n..]));
    let digit_first = (1..=2).any(|n| {
        b.len() > 1 + n
            && b[0].is_ascii_digit()
            && b[1..=n].iter().all(|c| is_upper(*c))
            && tail_ok(&b[1 + n..])
    });
    letters_first || digit_first
}

/// コールサイン(大文字にしたもの)か。ポータブル(`JA1ABC/P`、`JA/JL1NIE`)を含む。
pub fn is_callsign(s: &str) -> bool {
    if is_plain_call(s) {
        return true;
    }
    let parts: Vec<&str> = s.split('/').collect();
    matches!(parts.len(), 2 | 3)
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.chars().all(|c| is_upper(c) || c.is_ascii_digit()))
        && parts.iter().any(|p| is_plain_call(p))
}

/// 聞き取れなかった文字を `?` にしたコールサイン(`JA1AB?`、`JA1?BC`)。`?` を英字か数字に置き換えて
/// コールサインになるものだけ。QSO として受け付け、出力の前に「確かめてください」と知らせる
pub fn is_unsure_callsign(s: &str) -> bool {
    s.contains('?')
        && s.chars().any(|c| c != '?' && c != '/')
        && ['A', '0']
            .iter()
            .any(|r| is_callsign(&s.replace('?', &r.to_string())))
}

/// コールサインを (全体, 基本のコール, ポータブル, QRP) に分ける
pub fn parse_callsign(call: &str) -> Option<(String, String, String, String)> {
    let call_upper = call.to_uppercase();
    let parts: Vec<&str> = call_upper.split('/').collect();

    match parts.len() {
        1 => {
            if is_plain_call(&call_upper) {
                Some((call_upper.clone(), call_upper, String::new(), String::new()))
            } else {
                None
            }
        }
        2 => {
            let (a, b) = (parts[0], parts[1]);
            // CALL/N (エリア番号)
            if is_plain_call(a) && b.len() == 1 && b.chars().next().is_some_and(char::is_numeric) {
                return Some((
                    call_upper.clone(),
                    a.to_string(),
                    b.to_string(),
                    String::new(),
                ));
            }
            // CALL/P、CALL/QRP、PREFIX/CALL
            if is_plain_call(a) {
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
                return Some((
                    call_upper.clone(),
                    a.to_string(),
                    b.to_string(),
                    String::new(),
                ));
            }
            // PREFIX/CALL
            if is_plain_call(b) {
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
            // PREFIX/CALL/P または CALL/N/P
            let (a, b, c) = (parts[0], parts[1], parts[2]);
            if is_plain_call(a) && (c == "P" || c == "QRP") {
                let qrp = if c == "QRP" { "QRP" } else { "" };
                let portable = if c == "P" { "P" } else { b };
                return Some((
                    call_upper.clone(),
                    a.to_string(),
                    portable.to_string(),
                    qrp.to_string(),
                ));
            }
            if is_plain_call(b) {
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
    fn ordinary_callsigns() {
        for c in [
            "JA1ABC", "JL1NIE", "W1AW", "N1MM", "VK2ABC", "E51ABC", "A71AB", "S51ABC", "K1A",
        ] {
            assert!(is_plain_call(c), "{c}");
        }
    }

    #[test]
    fn digit_first_prefixes() {
        for c in [
            "7K1ABC", "7L1ABC", "7M3ABC", "7N4ABC", "8J1RL", "8N1ABC", "3B8CW", "9A1A", "4X4XX",
            "3DA0XX", "9M2ABC",
        ] {
            assert!(is_plain_call(c), "{c}");
        }
    }

    #[test]
    fn not_callsigns() {
        for w in [
            "HELLO", "TNX", "QSL", "100W", "73", "5NN", "0900", "FT8", "CW", "JT65", "JS8",
            "PSK31", "40M", "2M", "JA", "3D2", "", "A", "1", "ABCD1X",
        ] {
            assert!(!is_plain_call(w), "{w}");
            assert!(!is_callsign(w), "{w}");
        }
    }

    #[test]
    fn unsure_callsigns() {
        for c in ["JA1AB?", "JA1?BC", "JA?ABC", "JA1A??", "JA1AB?/P"] {
            assert!(is_unsure_callsign(c), "{c}");
            assert!(!is_callsign(c), "{c}");
        }
        for c in ["?", "??", "JA1ABC", "?/?", "HELLO?", "73?"] {
            assert!(!is_unsure_callsign(c), "{c}");
        }
    }

    #[test]
    fn portable_forms() {
        for c in [
            "JA1ABC/P",
            "JA1ABC/1",
            "7K1ABC/1",
            "7K1ABC/P",
            "JA/JL1NIE",
            "JL1NIE/QRP",
            "JA/JL1NIE/P",
            "JL1NIE/7/P",
        ] {
            assert!(is_callsign(c), "{c}");
        }
        for c in ["/JA1ABC", "JA1ABC/", "A/B", "JA1ABC/P/Q/R", "ja1abc/p"] {
            assert!(!is_callsign(c), "{c}");
        }
    }

    #[test]
    fn parts_of_a_callsign() {
        assert_eq!(
            parse_callsign("JA1ABC"),
            Some((
                "JA1ABC".into(),
                "JA1ABC".into(),
                String::new(),
                String::new()
            ))
        );
        assert_eq!(
            parse_callsign("7K1ABC/1"),
            Some((
                "7K1ABC/1".into(),
                "7K1ABC".into(),
                "1".into(),
                String::new()
            ))
        );
        assert_eq!(
            parse_callsign("ja1abc/p").map(|p| (p.1, p.2)),
            Some(("JA1ABC".into(), "P".into()))
        );
        assert_eq!(
            parse_callsign("JA1ABC/QRP").map(|p| (p.1, p.3)),
            Some(("JA1ABC".into(), "QRP".into()))
        );
        assert_eq!(
            parse_callsign("JA/JL1NIE").map(|p| (p.1, p.2)),
            Some(("JL1NIE".into(), "JA".into()))
        );
        assert_eq!(
            parse_callsign("JA/JL1NIE/P").map(|p| (p.1, p.2)),
            Some(("JL1NIE".into(), "JA".into()))
        );
        assert_eq!(parse_callsign("hello"), None);
        assert_eq!(
            parse_callsign("9A1A").map(|p| p.1),
            Some("9A1A".to_string())
        );
    }
}
