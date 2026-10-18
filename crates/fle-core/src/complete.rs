//! 入力補完: カーソル位置で文法上ありえるキーワードを返す。
//!
//! 候補の元データは、パーサが使う表(`KEYWORD_TABLE` / `MODE_TABLE` / `FREQ_TABLE`)
//! そのもの。キーワードを足せば補完にも現れる。
//! 画面は、返ってきた候補をそのまま並べるだけで、文法を知らない。

use serde::Serialize;

use crate::ham::FREQ_TABLE;
use crate::types::{KEYWORD_TABLE, MODE_TABLE};

/// `day` の後ろに置ける値(`compiler.rs` の `day` の処理に対応)
const DAY_OPERANDS: [&str; 2] = ["+", "++"];

/// 一度に返す候補の上限
const MAX_CANDIDATES: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CandidateKind {
    /// `mycall` `mysota` など、行頭に置くコマンド
    Command,
    /// `40m` `2m` など
    Band,
    /// `cw` `ssb` など
    Mode,
    /// `day` の後ろの `+` / `++`
    Day,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Candidate {
    pub text: String,
    pub kind: CandidateKind,
}

/// カーソルより前のテキストから、次に入力できるキーワードの候補を返す。
///
/// 行頭は語が多いので、1文字以上打ってから候補を出す。
/// 2語目以降は文法が絞っているので、何も打っていなくても出す。
pub fn complete(text_before_caret: &str) -> Vec<Candidate> {
    let line = text_before_caret
        .rsplit('\n')
        .next()
        .unwrap_or(text_before_caret);
    let token_start = line
        .rfind(char::is_whitespace)
        .map(|i| i + line[i..].chars().next().map_or(1, char::len_utf8))
        .unwrap_or(0);
    let (head, token) = line.split_at(token_start);
    let prefix = token.to_lowercase();
    let head_words: Vec<&str> = head.split_whitespace().collect();

    let mut candidates = match head_words.as_slice() {
        [] if prefix.is_empty() => Vec::new(),
        [] => line_start_keywords(&prefix),
        [first] if first.eq_ignore_ascii_case("day") => DAY_OPERANDS
            .iter()
            .filter(|op| matches_prefix(op, &prefix))
            .map(|op| Candidate {
                text: (*op).to_string(),
                kind: CandidateKind::Day,
            })
            .collect(),
        _ => Vec::new(),
    };
    candidates.truncate(MAX_CANDIDATES);
    candidates
}

fn line_start_keywords(prefix: &str) -> Vec<Candidate> {
    let commands = KEYWORD_TABLE.keys().copied();
    let bands = FREQ_TABLE.iter().map(|b| b.wavelength);
    let modes = MODE_TABLE.keys().copied();

    [
        (CandidateKind::Command, sorted_matches(commands, prefix)),
        (CandidateKind::Band, sorted_matches(bands, prefix)),
        (CandidateKind::Mode, sorted_matches(modes, prefix)),
    ]
    .into_iter()
    .flat_map(|(kind, texts)| {
        texts.into_iter().map(move |text| Candidate {
            text: text.to_string(),
            kind,
        })
    })
    .collect()
}

/// 前方一致するものを、短い順・辞書順に並べる(表の並びに依存しない)
fn sorted_matches<'a>(words: impl Iterator<Item = &'a str>, prefix: &str) -> Vec<&'a str> {
    let mut v: Vec<&str> = words.filter(|w| matches_prefix(w, prefix)).collect();
    v.sort_by_key(|w| (w.len(), *w));
    v.dedup();
    v
}

/// 前方一致し、かつ入力済みの語と同じではない
fn matches_prefix(word: &str, prefix: &str) -> bool {
    let w = word.to_lowercase();
    w.starts_with(prefix) && w != prefix
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(c: &[Candidate]) -> Vec<&str> {
        c.iter().map(|c| c.text.as_str()).collect()
    }

    #[test]
    fn command_is_completed_from_its_prefix() {
        let c = complete("mys");
        assert_eq!(texts(&c), vec!["mysota"]);
        assert_eq!(c[0].kind, CandidateKind::Command);
    }

    #[test]
    fn candidates_are_ordered_the_same_way_every_time() {
        assert_eq!(
            texts(&complete("my")),
            vec!["mycall", "mypota", "mysota", "mywwff"]
        );
    }

    #[test]
    fn band_is_completed_with_its_kind() {
        let c = complete("4");
        let band = c.iter().find(|c| c.text == "40m").expect("40m");
        assert_eq!(band.kind, CandidateKind::Band);
    }

    #[test]
    fn mode_is_completed_on_a_later_line() {
        let c = complete("mycall JA1ABC\ns");
        let ssb = c.iter().find(|c| c.text == "ssb").expect("ssb");
        assert_eq!(ssb.kind, CandidateKind::Mode);
    }

    #[test]
    fn day_operands_are_offered_even_before_typing() {
        assert_eq!(texts(&complete("day ")), vec!["+", "++"]);
        assert!(complete("day ")
            .iter()
            .all(|c| c.kind == CandidateKind::Day));
    }

    #[test]
    fn day_operand_already_typed_is_not_repeated() {
        assert_eq!(texts(&complete("day +")), vec!["++"]);
        assert!(complete("day ++").is_empty());
    }

    #[test]
    fn nothing_is_offered_where_a_free_word_goes() {
        assert!(complete("0905 ja").is_empty()); // QSO行のコールサイン
        assert!(complete("mycall ").is_empty()); // コマンドの値
        assert!(complete("mycall ja").is_empty());
    }

    #[test]
    fn nothing_is_offered_at_an_empty_line_start() {
        assert!(complete("").is_empty());
        assert!(complete("mycall JA1ABC\n").is_empty());
    }

    #[test]
    fn an_exactly_typed_keyword_is_not_offered_again() {
        assert!(complete("ssb").is_empty());
        assert!(complete("mysota").is_empty());
    }

    #[test]
    fn matching_ignores_case() {
        assert_eq!(texts(&complete("MYS")), vec!["mysota"]);
    }

    #[test]
    fn kind_serializes_in_camel_case() {
        let json = serde_json::to_value(complete("mys")).unwrap();
        assert_eq!(json[0]["text"], "mysota");
        assert_eq!(json[0]["kind"], "command");
    }
}
