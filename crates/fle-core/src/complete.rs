//! 入力補完: カーソル位置で文法上ありえるキーワードを返す。
//!
//! 文法上来られるキーワードは、構文(`syntax::expected_next`)が返す。ここでは、入力中の語で
//! 絞って並べる。キーワードを足せば補完にも現れる。
//! 画面は、返ってきた候補をそのまま並べるだけで、文法を知らない。
//!
//! 設定行(`40m cw`)は、バンド(周波数)とモードが順不同で続けられるので、片方を書いたら
//! もう片方を候補にする(改行は要らない)。

use serde::Serialize;

use crate::syntax::{expected_next, TermKind};

/// よく使うモード・バンド。候補では、これらを先に並べる(残りは短い順・辞書順)
const COMMON_MODES: [&str; 8] = ["cw", "ssb", "fm", "am", "ft8", "ft4", "rtty", "psk31"];
const COMMON_BANDS: [&str; 12] = [
    "40m", "20m", "80m", "15m", "10m", "30m", "17m", "12m", "6m", "2m", "70cm", "160m",
];

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

/// 候補と、それを確定するときに置き換える範囲(`from` から、カーソルまで)。
///
/// 「どこからが入力中の語か」は文法の知識なので、画面ではなくコアが決める。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Completion {
    /// 置き換えの開始位置(渡したテキストの先頭から、UTF-16の文字位置)
    pub from: usize,
    pub candidates: Vec<Candidate>,
}

/// `complete` に、置き換える範囲を添えて返す。
pub fn complete_at(text_before_caret: &str) -> Completion {
    let token = text_before_caret
        .rsplit(char::is_whitespace)
        .next()
        .unwrap_or(text_before_caret);
    let start = text_before_caret.len() - token.len();
    Completion {
        from: text_before_caret[..start].encode_utf16().count(),
        candidates: complete(text_before_caret),
    }
}

/// カーソルより前のテキストから、次に入力できるキーワードの候補を返す。
///
/// 文法上来られるキーワードは、`syntax::expected_next` が返す。ここでは、入力中の語で絞り、
/// 並べるだけ。行頭は語が多いので、1文字以上打ってから候補を出す。
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

    if head.trim().is_empty() && prefix.is_empty() {
        return Vec::new();
    }

    let terms = expected_next(head);
    let mut kinds: Vec<TermKind> = Vec::new();
    for t in &terms {
        if !kinds.contains(&t.kind) {
            kinds.push(t.kind);
        }
    }

    let mut candidates: Vec<Candidate> = kinds
        .into_iter()
        .flat_map(|kind| {
            let words = terms.iter().filter(|t| t.kind == kind).map(|t| t.text);
            let (texts, out_kind) = match kind {
                TermKind::Command => (sorted_matches(words, &prefix), CandidateKind::Command),
                TermKind::Band => (
                    ranked_matches(words, &prefix, &COMMON_BANDS),
                    CandidateKind::Band,
                ),
                TermKind::Mode => (
                    ranked_matches(words, &prefix, &COMMON_MODES),
                    CandidateKind::Mode,
                ),
                // `+` と `++` は、この順(短い順)
                TermKind::Day => (sorted_matches(words, &prefix), CandidateKind::Day),
            };
            texts.into_iter().map(move |text| Candidate {
                text: text.to_string(),
                kind: out_kind,
            })
        })
        .collect();
    candidates.truncate(MAX_CANDIDATES);
    candidates
}

/// 前方一致するものを、よく使うもの → 短い順・辞書順に並べる(表の並びに依存しない)
fn ranked_matches<'a>(
    words: impl Iterator<Item = &'a str>,
    prefix: &str,
    common: &[&str],
) -> Vec<&'a str> {
    let mut v: Vec<&str> = words.filter(|w| matches_prefix(w, prefix)).collect();
    v.sort_by_key(|w| {
        (
            common.iter().position(|c| c == w).unwrap_or(usize::MAX),
            w.len(),
            *w,
        )
    });
    v.dedup();
    v
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
            vec!["mycall", "mygrid", "mypota", "mysota", "mywwff"]
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

    // ---- 設定行: バンドの次にモード、モードの次にバンド(改行は要らない) ----

    #[test]
    fn mode_is_offered_right_after_a_band_without_a_newline() {
        let c = complete("40m ");
        assert_eq!(texts(&c)[..4], ["cw", "ssb", "fm", "am"]);
        assert!(c.iter().all(|c| c.kind == CandidateKind::Mode));
    }

    #[test]
    fn the_mode_after_a_band_is_narrowed_by_the_typed_prefix() {
        assert_eq!(texts(&complete("40m s")), vec!["ssb"]);
        assert!(complete("40m cw").is_empty()); // 打ち終えた語は、繰り返さない
    }

    #[test]
    fn band_is_offered_after_a_mode() {
        let c = complete("cw ");
        assert_eq!(texts(&c)[..3], ["40m", "20m", "80m"]);
        assert!(c.iter().all(|c| c.kind == CandidateKind::Band));
    }

    #[test]
    fn a_frequency_counts_as_the_band() {
        let c = complete("7.025 ");
        assert_eq!(texts(&c)[0], "cw");
        assert!(c.iter().all(|c| c.kind == CandidateKind::Mode));
    }

    #[test]
    fn nothing_is_offered_once_band_and_mode_are_both_set() {
        assert!(complete("40m cw ").is_empty());
        assert!(complete("cw 40m ").is_empty());
    }

    #[test]
    fn common_modes_and_bands_come_first_everywhere() {
        // 先頭の語でも、よく使うものが先(短い順・辞書順より優先)
        assert_eq!(texts(&complete("f"))[..2], ["fm", "ft8"]);
        assert_eq!(texts(&complete("4"))[0], "40m");
    }

    #[test]
    fn a_setting_line_is_recognised_on_a_later_line_too() {
        let c = complete("mycall JA1ABC\n20m ");
        assert_eq!(texts(&c)[0], "cw");
    }

    #[test]
    fn a_qso_line_gets_no_band_or_mode_candidates() {
        assert!(complete("0900 ja1xyz ").is_empty());
        assert!(complete("0900 ").is_empty());
    }

    // ---- 置き換える範囲(from) ----

    #[test]
    fn from_is_where_the_word_being_typed_starts() {
        assert_eq!(complete_at("mys").from, 0);
        assert_eq!(complete_at("mycall JA1ABC\nmys").from, 14);
        assert_eq!(complete_at("40m s").from, 4);
    }

    #[test]
    fn from_is_the_caret_when_the_next_word_has_not_started() {
        assert_eq!(complete_at("day ").from, 4);
        assert_eq!(complete_at("40m ").from, 4);
    }

    #[test]
    fn from_counts_utf16_units() {
        assert_eq!(complete_at("コメント\nmys").from, 5);
        assert_eq!(complete_at("😀\nmys").from, 3);
    }

    #[test]
    fn complete_at_carries_the_same_candidates() {
        assert_eq!(complete_at("mys").candidates, complete("mys"));
    }

    #[test]
    fn kind_serializes_in_camel_case() {
        let json = serde_json::to_value(complete("mys")).unwrap();
        assert_eq!(json[0]["text"], "mysota");
        assert_eq!(json[0]["kind"], "command");
    }
}
