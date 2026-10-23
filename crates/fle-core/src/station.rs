//! 自局のコールサインと運用場所(SOTA / POTA / WWFF / グリッド)を、ログの指令として読み書きする。
//!
//! 指令の書式(`mycall …`、`mysota …`、`-` で解除)を知っているのはコアだけ。
//! 画面の「場所」シートは、入力を渡して、書き込む行(`Edit`)を受け取る。
//! 場所の指令は、現れた行以降が有効(`timezone` と同じ)。1つのログに、複数の場所を書ける。

use serde::{Deserialize, Serialize};

use crate::compiler::{canonical_grid, compile_fle};
use crate::fill::Edit;
use crate::syntax::{classify, Class};

/// 自局のコールサインと、いまの運用場所。すべて任意(空なら指定なし)。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Station {
    pub mycall: String,
    pub sota: String,
    pub pota: Vec<String>,
    pub wwff: String,
    pub grid: String,
}

/// 入力の誤り(どの項目が、なぜ)
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FieldError {
    /// `mycall` / `sota` / `pota` / `wwff` / `grid`
    pub field: String,
    pub message: String,
}

/// 書き込む修正と、入力の誤り。誤りがあるときは、修正は空。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StationPlan {
    pub edits: Vec<Edit>,
    pub errors: Vec<FieldError>,
}

/// `line`(0始まり)の行の**直前までのログ**で有効な、自局と運用場所。
/// 「場所」シートの初期値にする(カーソルの位置によって、どの場所かが変わる)。
pub fn station_at(text: &str, line: usize) -> Station {
    let before = text.split('\n').take(line).collect::<Vec<_>>().join("\n");
    let r = compile_fle(&before);
    Station {
        mycall: r.mycall,
        sota: r.mysota,
        pota: r.mypota,
        wwff: r.mywwff,
        grid: r.mygrid,
    }
}

/// `want` をログに書き込む修正を作る。`line`(0始まり)の行の前に、指令の行を入れる。
///
/// - 現在の値(`station_at`)と違う項目だけを書く。同じなら何も書かない(冪等)。
/// - 現在あるものを空にするときは、`-` を書く(自局のコールサインは解除できない)。
/// - 書式の誤りは、書き込まずに `errors` で返す。
pub fn station_plan(text: &str, line: usize, want: &Station) -> StationPlan {
    let want = normalize(want);
    let errors = validate(&want);
    if !errors.is_empty() {
        return StationPlan {
            edits: Vec::new(),
            errors,
        };
    }

    let now = station_at(text, line);
    let mut lines: Vec<String> = Vec::new();
    if !want.mycall.is_empty() && want.mycall != now.mycall {
        lines.push(format!("mycall {}", want.mycall));
    }
    if let Some(l) = directive("mysota", &now.sota, &want.sota) {
        lines.push(l);
    }
    if let Some(l) = directive("mypota", &now.pota.join(" "), &want.pota.join(" ")) {
        lines.push(l);
    }
    if let Some(l) = directive("mywwff", &now.wwff, &want.wwff) {
        lines.push(l);
    }
    if let Some(l) = directive("mygrid", &now.grid, &want.grid) {
        lines.push(l);
    }
    if lines.is_empty() {
        return StationPlan {
            edits: Vec::new(),
            errors,
        };
    }

    let all: Vec<&str> = text.split('\n').collect();
    let block = lines.join("\n");
    let (at, insert) = if line < all.len() {
        let at = all[..line]
            .iter()
            .map(|l| l.encode_utf16().count() + 1)
            .sum();
        (at, format!("{block}\n"))
    } else {
        // 最後の行より後ろ: 末尾に足す(末尾が改行でなければ、改行を挟む)
        let at = text.encode_utf16().count();
        let lead = if text.is_empty() || text.ends_with('\n') {
            ""
        } else {
            "\n"
        };
        (at, format!("{lead}{block}\n"))
    };
    StationPlan {
        edits: vec![Edit {
            from: at,
            to: at,
            insert,
        }],
        errors,
    }
}

/// 項目の指令の行。違わなければ None。空にするときは `-`。
fn directive(key: &str, now: &str, want: &str) -> Option<String> {
    match (now == want, want.is_empty()) {
        (true, _) => None,
        (false, true) => Some(format!("{key} -")),
        (false, false) => Some(format!("{key} {want}")),
    }
}

/// 空白・カンマで区切られた入力を整え、大文字にそろえる(グリッドは慣例の書き方に)
fn normalize(s: &Station) -> Station {
    let words = |v: &str| -> Vec<String> {
        v.split(|c: char| c.is_whitespace() || c == ',')
            .filter(|w| !w.is_empty())
            .map(str::to_uppercase)
            .collect()
    };
    let one = |v: &str| words(v).into_iter().next().unwrap_or_default();
    let grid = one(&s.grid);
    Station {
        mycall: one(&s.mycall),
        sota: one(&s.sota),
        pota: s.pota.iter().flat_map(|p| words(p)).collect(),
        wwff: one(&s.wwff),
        grid: canonical_grid(&grid).unwrap_or(grid),
    }
}

fn validate(s: &Station) -> Vec<FieldError> {
    let is = |value: &str, pred: fn(&Class) -> bool| {
        value
            .split_whitespace()
            .next()
            .is_some_and(|w| pred(&classify(w)))
    };
    let mut errors = Vec::new();
    let mut check = |field: &str, ok: bool, message: &str| {
        if !ok {
            errors.push(FieldError {
                field: field.to_string(),
                message: message.to_string(),
            });
        }
    };
    if !s.mycall.is_empty() {
        check(
            "mycall",
            is(&s.mycall, |t| matches!(t, Class::Call(_))),
            "Invalid callsign",
        );
    }
    if !s.sota.is_empty() {
        check(
            "sota",
            // 自局の山は、協会まで書く(協会を補う元がない)
            is(&s.sota, |t| matches!(t, Class::Sota(c) if c.contains('/'))),
            "Invalid SOTA reference (e.g. JA/TK-001)",
        );
    }
    for p in &s.pota {
        check(
            "pota",
            is(p, |t| matches!(t, Class::Pota(_))),
            "Invalid POTA reference (e.g. JA-0001)",
        );
    }
    if !s.wwff.is_empty() {
        check(
            "wwff",
            is(&s.wwff, |t| matches!(t, Class::Wwff(_))),
            "Invalid WWFF reference (e.g. JAFF-0001)",
        );
    }
    if !s.grid.is_empty() {
        check(
            "grid",
            canonical_grid(&s.grid).is_some(),
            "Invalid grid locator (e.g. PM95uq)",
        );
    }
    errors
}

/// 緯度・経度から、6文字のグリッドロケータ(メイデンヘッド)を求める。範囲外・非数は None。
pub fn grid_locator(lat: f64, lon: f64) -> Option<String> {
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
        return None;
    }
    // 北端・東端は、最後の区画に入れる
    let lon = (lon + 180.0).min(359.999_999);
    let lat = (lat + 90.0).min(179.999_999);

    let (f_lon, r) = ((lon / 20.0).floor(), lon % 20.0);
    let (s_lon, r) = ((r / 2.0).floor(), r % 2.0);
    let ss_lon = (r / (2.0 / 24.0)).floor();
    let (f_lat, r) = ((lat / 10.0).floor(), lat % 10.0);
    let (s_lat, r) = (r.floor(), r % 1.0);
    let ss_lat = (r / (1.0 / 24.0)).floor();

    let letter = |n: f64, base: u8| char::from(base + n as u8);
    Some(format!(
        "{}{}{}{}{}{}",
        letter(f_lon, b'A'),
        letter(f_lat, b'A'),
        s_lon as u8,
        s_lat as u8,
        letter(ss_lon, b'a'),
        letter(ss_lat, b'a')
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn apply(text: &str, edits: &[Edit]) -> String {
        let mut units: Vec<u16> = text.encode_utf16().collect();
        for e in edits.iter().rev() {
            units.splice(e.from..e.to, e.insert.encode_utf16());
        }
        String::from_utf16(&units).unwrap()
    }

    fn st(mycall: &str, sota: &str, pota: &[&str], wwff: &str, grid: &str) -> Station {
        Station {
            mycall: mycall.into(),
            sota: sota.into(),
            pota: pota.iter().map(|s| s.to_string()).collect(),
            wwff: wwff.into(),
            grid: grid.into(),
        }
    }

    // ---- grid_locator ----

    #[test]
    fn grid_of_well_known_places() {
        assert_eq!(grid_locator(35.6586, 139.7454).as_deref(), Some("PM95up")); // 東京タワー
        assert_eq!(grid_locator(51.4779, -0.0015).as_deref(), Some("IO91xl")); // グリニッジ
        assert_eq!(grid_locator(0.0, 0.0).as_deref(), Some("JJ00aa"));
    }

    #[test]
    fn grid_at_the_edges_of_the_world() {
        assert_eq!(grid_locator(-90.0, -180.0).as_deref(), Some("AA00aa"));
        assert_eq!(grid_locator(90.0, 180.0).as_deref(), Some("RR99xx"));
    }

    #[test]
    fn grid_rejects_out_of_range_and_nan() {
        assert_eq!(grid_locator(91.0, 0.0), None);
        assert_eq!(grid_locator(0.0, 181.0), None);
        assert_eq!(grid_locator(f64::NAN, 0.0), None);
    }

    #[test]
    fn the_computed_grid_is_accepted_by_the_log() {
        let g = grid_locator(35.6586, 139.7454).unwrap();
        assert!(canonical_grid(&g).is_some());
    }

    // ---- station_at ----

    #[test]
    fn station_at_reads_what_is_in_effect_before_the_line() {
        let text = "mycall JA1ABC\nmysota JA/TK-001\nmypota JA-0001 JA-0002\nmygrid PM95uq\n40m cw\n0900 ja1xyz\n";
        assert_eq!(
            station_at(text, 5),
            st("JA1ABC", "JA/TK-001", &["JA-0001", "JA-0002"], "", "PM95uq")
        );
    }

    #[test]
    fn station_at_follows_the_caret_across_several_places() {
        let text =
            "mycall JA1ABC\nmysota JA/TK-001\n40m cw\n0900 ja1aaa\nmysota JA/TK-002\n1000 ja1bbb\n";
        assert_eq!(station_at(text, 3).sota, "JA/TK-001"); // 1か所目
        assert_eq!(station_at(text, 5).sota, "JA/TK-002"); // 2か所目
    }

    #[test]
    fn station_at_an_empty_log_is_empty() {
        assert_eq!(station_at("", 0), Station::default());
    }

    // ---- station_plan ----

    #[test]
    fn a_new_log_gets_its_header_at_the_top() {
        let want = st("ja1abc/1", "ja/tk-001", &["ja-0001"], "", "pm95UQ");
        let plan = station_plan("", 0, &want);
        assert!(plan.errors.is_empty());
        assert_eq!(
            apply("", &plan.edits),
            "mycall JA1ABC/1\nmysota JA/TK-001\nmypota JA-0001\nmygrid PM95uq\n"
        );
    }

    #[test]
    fn only_the_changed_items_are_written() {
        let text = "mycall JA1ABC\nmysota JA/TK-001\nmygrid PM95uq\n40m cw\n0900 ja1aaa\n";
        let want = st("JA1ABC", "JA/TK-002", &[], "", "PM95uq");
        let plan = station_plan(text, 5, &want);
        assert_eq!(apply(text, &plan.edits), "mycall JA1ABC\nmysota JA/TK-001\nmygrid PM95uq\n40m cw\n0900 ja1aaa\nmysota JA/TK-002\n");
    }

    #[test]
    fn emptying_an_item_writes_a_hyphen() {
        let text = "mysota JA/TK-001\nmypota JA-0001\n0900 ja1aaa\n";
        let want = st("", "", &["JA-0001"], "", "");
        let plan = station_plan(text, 3, &want);
        assert_eq!(
            apply(text, &plan.edits),
            "mysota JA/TK-001\nmypota JA-0001\n0900 ja1aaa\nmysota -\n"
        );
    }

    #[test]
    fn nothing_is_written_when_nothing_changed() {
        let text = "mycall JA1ABC\nmysota JA/TK-001\n40m cw\n";
        assert!(
            station_plan(text, 3, &st("JA1ABC", "JA/TK-001", &[], "", ""))
                .edits
                .is_empty()
        );
    }

    #[test]
    fn a_second_place_is_inserted_where_the_caret_is() {
        // 2か所目の山へ移動: カーソルのある行(末尾の空行)の前に書く
        let text = "mycall JA1ABC\nmysota JA/TK-001\n40m cw\n0900 ja1aaa\n";
        let plan = station_plan(
            text,
            4,
            &st("JA1ABC", "JA/TK-002", &["JA-0009"], "", "PM96aa"),
        );
        let after = apply(text, &plan.edits);
        assert!(
            after.ends_with("0900 ja1aaa\nmysota JA/TK-002\nmypota JA-0009\nmygrid PM96aa\n"),
            "{after:?}"
        );
        // 書いた結果が、そのまま2か所の運用として解釈される
        let r = compile_fle(&format!("{after}0910 ja1bbb"));
        assert!(r.errors.is_empty(), "{:?}", r.errors);
        assert_eq!(r.records[0].mysota, "JA/TK-001");
        assert_eq!(
            (
                r.records[1].mysota.as_str(),
                r.records[1].mypota.clone(),
                r.records[1].my_grid.as_str()
            ),
            ("JA/TK-002", vec!["JA-0009".to_string()], "PM96aa")
        );
    }

    #[test]
    fn a_line_past_the_end_appends_with_a_newline_when_needed() {
        let plan = station_plan("mycall JA1ABC", 9, &st("", "JA/TK-001", &[], "", ""));
        assert_eq!(
            apply("mycall JA1ABC", &plan.edits),
            "mycall JA1ABC\nmysota JA/TK-001\n"
        );
    }

    #[test]
    fn positions_count_utf16_units() {
        let text = "コメント😀\n";
        let plan = station_plan(text, 1, &st("", "JA/TK-001", &[], "", ""));
        assert_eq!(apply(text, &plan.edits), "コメント😀\nmysota JA/TK-001\n");
    }

    #[test]
    fn invalid_input_is_reported_per_field_and_nothing_is_written() {
        let plan = station_plan("", 0, &st("???", "xx", &["bad"], "nope", "ZZ99"));
        assert!(plan.edits.is_empty());
        let fields: Vec<&str> = plan.errors.iter().map(|e| e.field.as_str()).collect();
        assert_eq!(fields, vec!["mycall", "sota", "pota", "wwff", "grid"]);
        // 自局の山は、協会まで書く
        let plan = station_plan("", 0, &st("", "nn-108", &[], "", ""));
        assert_eq!(plan.errors.len(), 1);
        assert_eq!(plan.errors[0].field, "sota");
    }

    #[test]
    fn several_parks_may_be_typed_with_spaces_or_commas() {
        let plan = station_plan("", 0, &st("", "", &["ja-0001, ja-0002 JA-0003"], "", ""));
        assert_eq!(apply("", &plan.edits), "mypota JA-0001 JA-0002 JA-0003\n");
    }

    #[test]
    fn applying_the_plan_twice_changes_nothing_more() {
        let text = "40m cw\n";
        let want = st("JA1ABC/1", "JA/TK-001", &["JA-0001"], "JAFF-0001", "PM95uq");
        let once = apply(text, &station_plan(text, 0, &want).edits);
        let last = once.split('\n').count() - 1; // 末尾の空行
        assert!(
            station_plan(&once, last, &want).edits.is_empty(),
            "{once:?}"
        );
    }

    #[test]
    fn serializes_and_deserializes_with_camel_case() {
        let want: Station =
            serde_json::from_str(r#"{"mycall":"JA1ABC","pota":["JA-0001"]}"#).unwrap();
        assert_eq!(want.pota, vec!["JA-0001"]);
        assert_eq!(want.sota, "");
        let json = serde_json::to_value(station_plan("", 0, &want)).unwrap();
        assert!(json["edits"][0]["insert"]
            .as_str()
            .unwrap()
            .contains("mycall JA1ABC"));
    }
}
