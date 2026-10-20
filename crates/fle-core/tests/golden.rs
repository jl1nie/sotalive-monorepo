//! 文法の移行(正規表現のトークナイザー → nom)で、挙動が変わらないことを確かめる、正解データとの比較。
//!
//! `CASES` の各入力を `compile_fle` にかけた結果を、`tests/golden/compile.json`(旧実装で作った記録)と
//! 比べる。意図して変えたもの(`docs/fle-grammar.md` の決定)は、`CHANGED` に理由つきで列挙し、
//! 新しい挙動は、別のテストで確かめる。
//!
//! 記録を作り直すとき: `UPDATE_GOLDEN=1 cargo test -p fle-core --test golden`

use fle_core::{compile_fle, sample_log};
use serde_json::{json, Map, Value};

/// 入力の集まり(名前, FLEのテキスト)
fn cases() -> Vec<(&'static str, String)> {
    let h = "mycall JA1ABC\ndate 2026-10-18\n40m cw\n";
    let mut v: Vec<(&'static str, String)> = vec![
        ("empty", "".into()),
        ("blank_lines", "\n   \n\t\n".into()),
        ("sample_log", sample_log("2026-10-18")),
        ("whole_line_comment", format!("{h}# これは注釈\n0900 ja1xyz")),
        ("inline_hash_comment", format!("{h}0900 ja1xyz 599 599 # あと")),
        // ---- 指令 ----
        ("mycall_ok", "mycall JA1ABC/1\n40m cw\n0900 ja1xyz".into()),
        ("mycall_lower", "mycall ja1abc\n40m cw\n0900 ja1xyz".into()),
        ("mycall_portable_p", "mycall JA1ABC/P\n40m cw\n0900 ja1xyz".into()),
        ("mycall_prefix", "mycall 7K1ABC\n40m cw\n0900 ja1xyz".into()),
        ("mycall_missing", "mycall\n40m cw\n0900 ja1xyz".into()),
        ("mycall_invalid", "mycall hello\n40m cw\n0900 ja1xyz".into()),
        ("operator_ok", "mycall JA1ABC/P\noperator JL1NIE\n40m cw\n0900 ja1xyz".into()),
        ("operator_invalid", "operator ???\n40m cw\n0900 ja1xyz".into()),
        ("mysota_ok", format!("{h}mysota ja/tk-001\n0900 ja1xyz")),
        ("mysota_invalid", format!("{h}mysota xx\n0900 ja1xyz")),
        ("mysota_missing", format!("{h}mysota\n0900 ja1xyz")),
        ("mysota_clear", format!("{h}mysota JA/TK-001\n0900 ja1aaa\nmysota -\n0910 ja1bbb")),
        ("mywwff_ok", format!("{h}mywwff jaff-0001\n0900 ja1xyz")),
        ("mywwff_invalid", format!("{h}mywwff nope\n0900 ja1xyz")),
        ("mypota_one", format!("{h}mypota JP-0117\n0900 ja1xyz")),
        ("mypota_two", format!("{h}mypota JP-0117 JP-0118\n0900 ja1xyz")),
        ("mypota_replace", format!("{h}mypota JP-0001\n0900 ja1aaa\nmypota JP-0002\n0910 ja1bbb")),
        ("mypota_invalid_keeps_previous", format!("{h}mypota JP-0001\nmypota nonsense\n0900 ja1xyz")),
        ("mypota_clear", format!("{h}mypota JP-0001\n0900 ja1aaa\nmypota -\n0910 ja1bbb")),
        ("mygrid_ok", format!("{h}mygrid pm95UQ\n0900 ja1xyz")),
        ("mygrid_invalid", format!("{h}mygrid XX99\n0900 ja1xyz")),
        ("mygrid_clear", format!("{h}mygrid PM95\n0900 ja1aaa\nmygrid -\n0910 ja1bbb")),
        ("date_ymd", "date 2026-10-18\n40m cw\n0900 ja1xyz".into()),
        ("date_slash", "date 2026/10/18\n40m cw\n0900 ja1xyz".into()),
        ("date_md", "date 2026-10-18\ndate 11-03\n40m cw\n0900 ja1xyz".into()),
        ("date_out_of_range", "date 2026-13-45\n40m cw\n0900 ja1xyz".into()),
        ("date_wrong_format", "date hello\n40m cw\n0900 ja1xyz".into()),
        ("date_missing", "date\n40m cw\n0900 ja1xyz".into()),
        ("day_plus", format!("{h}0900 ja1aaa\nday +\n0010 ja1bbb")),
        ("day_plusplus", format!("{h}0900 ja1aaa\nday ++\n0010 ja1bbb")),
        ("day_unknown", format!("{h}day x\n0900 ja1xyz")),
        ("day_missing", format!("{h}day\n0900 ja1xyz")),
        ("timezone_plus9", "mycall JA1ABC\ndate 2026-10-18\ntimezone +9\n40m cw\n1805 ja1xyz".into()),
        ("timezone_minus5", "mycall JA1ABC\ndate 2026-10-18\ntimezone -5\n40m cw\n0405 ja1xyz".into()),
        ("timezone_change_midlog", format!("{h}0900 ja1aaa\ntimezone +9\n1805 ja1bbb")),
        ("timezone_unsigned", format!("{h}timezone 9\n0900 ja1xyz")),
        ("timezone_invalid", format!("{h}timezone x\n0900 ja1xyz")),
        ("timezone_missing", format!("{h}timezone\n0900 ja1xyz")),
        ("rigset_ok", format!("{h}rigset 2\n0900 ja1xyz")),
        ("rigset_invalid", format!("{h}rigset x\n0900 ja1xyz")),
        ("rigset_missing", format!("{h}rigset\n0900 ja1xyz")),
        ("nickname", format!("{h}nickname taro\n0900 ja1xyz")),
        ("number_consecutive", format!("{h}number consecutive\n0900 ja1xyz .001 ,002")),
        ("number_literal", format!("{h}number tokyo\n0900 ja1xyz .abc ,def")),
        ("qslmsg_plain", format!("{h}qslmsg tnx for the qso\n0900 ja1xyz")),
        ("qslmsg_vars", format!("{h}mysota JA/TK-001\nmypota JP-0001\nmywwff JAFF-0001\nqslmsg $mysota $mypota $mywwff\n0900 ja1xyz")),
        ("qslmsg2", format!("{h}qslmsg2 second\n0900 ja1xyz")),
        // ---- 時刻 ----
        ("time_4digits", format!("{h}0930 ja1xyz")),
        ("time_3digits", format!("{h}0900 ja1aaa\n915 ja1bbb")),
        ("time_2digits", format!("{h}0900 ja1aaa\n15 ja1bbb")),
        ("time_1digit", format!("{h}0902 ja1aaa\n4 ja1bbb")),
        ("time_sequence", format!("{h}0902 ja1aaa\n4 ja1bbb\n14 ja1ccc\n40 ja1ddd")),
        ("time_carries_over_lines", format!("{h}0900 ja1aaa\nja1bbb")),
        ("time_none_at_all", format!("{h}ja1xyz")),
        ("time_after_date_resets", format!("{h}0955 ja1aaa\nday +\n20 ja1bbb")),
        ("time_after_call", format!("{h}ja1xyz 599 579 0910")),
        // ---- バンド・周波数・モード ----
        ("band_inline", "mycall JA1ABC\ndate 2026-10-18\n0900 40m cw ja1xyz".into()),
        ("band_then_freq", "mycall JA1ABC\ndate 2026-10-18\n40m 7.025 cw\n0900 ja1xyz".into()),
        ("freq_only", "mycall JA1ABC\ndate 2026-10-18\n7.025 cw\n0900 ja1xyz".into()),
        ("freq_out_of_band", "mycall JA1ABC\ndate 2026-10-18\n8.5 cw\n0900 ja1xyz".into()),
        ("band_uppercase", "mycall JA1ABC\ndate 2026-10-18\n40M cw\n0900 ja1xyz".into()),
        ("band_missing", "mycall JA1ABC\ndate 2026-10-18\n0900 ja1xyz".into()),
        ("mode_switch", format!("{h}0900 ja1aaa\nssb\n0910 ja1bbb\nft8\n0920 ja1ccc")),
        ("mode_inline", format!("{h}0900 ssb ja1xyz")),
        ("bands_all", "mycall JA1ABC\ndate 2026-10-18\n160m cw\n0900 ja1a\n".replace("ja1a\n", "ja1aaa\n80m\n0901 ja1bbb\n20m\n0902 ja1ccc\n2m fm\n0903 ja1ddd\n70cm\n0904 ja1eee")),
        // ---- RST ----
        ("rst_default_cw", format!("{h}0900 ja1xyz")),
        ("rst_default_ssb", "mycall JA1ABC\ndate 2026-10-18\n40m ssb\n0900 ja1xyz".into()),
        ("rst_default_ft8", "mycall JA1ABC\ndate 2026-10-18\n20m ft8\n0900 ja1xyz".into()),
        ("rst_three_digits", format!("{h}0900 ja1xyz 579 449")),
        ("rst_two_digits", format!("{h}0900 ja1xyz 57 44")),
        ("rst_one_digit", format!("{h}0900 ja1xyz 4 7")),
        ("rst_sent_only", format!("{h}0900 ja1xyz 579")),
        ("rst_snr", "mycall JA1ABC\ndate 2026-10-18\n20m ft8\n0900 ja1xyz -12 +03".into()),
        ("rst_past_comment", format!("{h}0900 ja1xyz <hi> 5 7")),
        ("rst_resets_per_line", format!("{h}0900 ja1aaa 579\nja1bbb")),
        // ---- コールサイン ----
        ("call_plain", format!("{h}0900 ja1xyz")),
        ("call_lower", format!("{h}0900 ja1xyz")),
        ("call_portable", format!("{h}0900 ja1xyz/p")),
        ("call_area", format!("{h}0900 ja1xyz/7")),
        ("call_prefix_slash", format!("{h}0900 ja/jl1nie")),
        ("call_qrp", format!("{h}0900 ja1xyz/qrp")),
        ("call_digit_first", format!("{h}0900 7k1abc")),
        ("call_digit_first_portable", format!("{h}0900 8j1rl/1")),
        ("call_overseas", format!("{h}0900 3b8cw\n0905 9a1a\n0910 w1aw\n0915 vk2abc\n0920 4x4xx")),
        ("call_two_in_one_line", format!("{h}0900 ja1aaa ja1bbb")),
        ("call_missing_letters_only", format!("{h}0900 hello")),
        // ---- リファレンス ----
        ("his_sota", format!("{h}0900 ja1xyz ja/tk-001")),
        ("his_wwff", format!("{h}0900 ja1xyz jaff-0001")),
        ("his_pota_two", format!("{h}0900 ja1xyz jp-0001 jp-0002")),
        ("his_refs_mixed", format!("{h}0900 ja1xyz ja/tk-001 jaff-0001 jp-0001")),
        ("unknown_ref", format!("{h}0900 ja1xyz my-name")),
        // ---- コンテスト ----
        ("contest_numbers", format!("{h}number consecutive\n0900 ja1xyz\n0901 ja1abc ,123\n0902 ja1def .999 ,456")),
        // ---- コメント・平文 ----
        ("comment_angle", format!("{h}0900 ja1xyz <taro>")),
        ("comment_square", format!("{h}0900 ja1xyz [tnx]")),
        ("comment_curly", format!("{h}0900 ja1xyz {{tokyo}}")),
        ("comment_all_three", format!("{h}0900 ja1xyz <taro> [tnx] {{tokyo}}")),
        ("comment_japanese", format!("{h}0900 ja1xyz <曽田さん>{{島根市}}")),
        ("comment_repeated_last_wins", format!("{h}0900 ja1xyz <a> <b>")),
        ("plain_one_word", format!("{h}0900 ja1xyz hello")),
        ("plain_two_words", format!("{h}0900 ja1xyz taro tokyo")),
        ("plain_three_words", format!("{h}0900 ja1xyz hello world foo")),
        ("plain_mixed_case", format!("{h}0900 ja1xyz Hello World")),
        ("plain_and_curly", format!("{h}0900 ja1xyz hello {{remark}} world")),
        ("unclosed_comment", format!("{h}0900 ja1xyz {{abc")),
        ("unclosed_angle_then_more", format!("{h}0900 ja1xyz <abc 599")),
        // ---- 空白 ----
        ("tab_separated", format!("{h}0900\tja1xyz\t599\t579")),
        ("fullwidth_space", format!("{h}0900\u{3000}ja1xyz\u{3000}599")),
        ("leading_spaces", format!("{h}   0900   ja1xyz")),
        ("crlf", "mycall JA1ABC\r\ndate 2026-10-18\r\n40m cw\r\n0900 ja1xyz\r\n".into()),
        // ---- 黙って無視されていたもの(決定で、誤りにする・挙動を変える) ----
        ("ignored_extra_operand", "mycall JA1ABC extra\n40m cw\n0900 ja1xyz".into()),
        ("ignored_keyword_mid_line", format!("{h}0900 ja1xyz date")),
        ("ignored_consecutive_first", format!("{h}consecutive\n0900 ja1xyz")),
        ("ignored_five_digit_time", format!("{h}09000 ja1xyz")),
        ("invalid_hour", format!("{h}2500 ja1xyz")),
        ("invalid_minute_4digits", format!("{h}0975 ja1xyz")),
        ("invalid_minute_2digits", format!("{h}0900 ja1aaa\n75 ja1bbb")),
        ("valid_last_minute", format!("{h}2359 ja1xyz")),
        ("hour_overflow_after_rollback", format!("{h}2355 ja1aaa\n05 ja1bbb")),
        ("ignored_date_overflow", "date 99999-1-1\n40m cw\n0900 ja1xyz".into()),
        ("ignored_qslmsg_empty", format!("{h}qslmsg\n0900 ja1xyz")),
        ("dropped_no_call", format!("{h}0900 ja1aaa\n05 ja\n0910 ja1bbb")),
        ("dropped_minutes_only", format!("{h}0900 ja1aaa\n05\n0910 ja1bbb")),
        ("minute_goes_back", format!("{h}0955 ja1aaa\n05 ja1bbb")),
        ("two_bands_one_line", format!("{h}0900 20m ja1xyz")),
        ("two_modes_one_line", format!("{h}0900 ssb am ja1xyz")),
        ("stray_snr_in_qso_line", format!("{h}0900 ja1xyz 599 579 -10")),
        ("stray_date_in_qso_line", format!("{h}0900 ja1xyz 2026-10-19")),
        ("fullwidth_digits", format!("{h}０９００ ja1xyz")),
        ("fullwidth_callsign", format!("{h}0900 ＪＡ１ＸＹＺ")),
        ("fullwidth_mixed", format!("{h}０９００　ＪＡ１ＸＹＺ　５９９")),
        // ---- 設定行だけ ----
        ("settings_only", "40m cw\nssb\n20m\n7.025".into()),
        ("settings_mode_then_band", "cw 40m\n0900 ja1xyz".into()),
        // ---- 実際のログに近いもの ----
        ("realistic_sota", "mycall JL1NIE/1\ndate 2026-10-18\ntimezone +9\nmysota JA/TK-001\nmygrid PM95fm\n40m cw\n0902 ja1qsa\n4 ja4qru 5 7 <taro>\n14 jh1abc\nssb\n21 jg0qro/0 ja/nn-001\n7k1abc\n".into()),
        ("realistic_pota_two_parks", "mycall JA1ABC\ndate 2026-10-18\n40m cw\nmypota JP-0117 JP-0118\nmygrid PM95pp\n0900 ja1aaa\n10 ja1bbb\nmypota JP-1205\nmygrid PM95aa\n1100 ja1ccc\n".into()),
    ];
    v.sort_by_key(|(n, _)| *n);
    v
}

/// 意図して変えたもの(決定の番号と、理由)。記録との一致は求めず、新しい挙動は別のテストで確かめる。
const CHANGED: &[(&str, &str)] = &[
    // 決定11: `timezone` に jst・utc の名前を使えるようにした(値のない誤りの案内に、jst を足した)
    ("timezone_missing", "決定11: 案内の文面に jst を足した"),
    // 決定10: `rigset N` を廃止し、HAMLOG の Rig= の右辺を書く `rig` にする(`rigset` は案内つきの誤り)
    ("rigset_ok", "決定10: rigset は rig に変わった(誤りで案内)"),
    (
        "rigset_invalid",
        "決定10: rigset は rig に変わった(誤りで案内)",
    ),
    (
        "rigset_missing",
        "決定10: rigset は rig に変わった(誤りで案内)",
    ),
    (
        "sample_log",
        "決定10: 見本のログが、rigset の代わりに rig を使う",
    ),
    // モードを書かないQSOは、ADIF の MODE が空になるので誤りにする
    (
        "band_missing",
        "モード未指定のQSOは誤り(missing_mode)。以前は誤りにならなかった",
    ),
    // 決定3: 5桁以上の時刻・桁あふれの日付を誤りにする
    ("ignored_five_digit_time", "決定3: 5桁以上の時刻は誤り"),
    ("ignored_date_overflow", "決定3: 桁あふれの日付は誤り"),
    (
        "invalid_hour",
        "決定3: 24時以降の時刻は誤り(以前は 00:00 になっていた)",
    ),
    (
        "invalid_minute_4digits",
        "決定3: 60分以上は誤り(以前は黙って丸めていた)",
    ),
    (
        "invalid_minute_2digits",
        "決定3: 60分以上は誤り(以前は黙って丸めていた)",
    ),
    (
        "hour_overflow_after_rollback",
        "決定4: 分が戻ると時を進めるので、24時になる場合は誤り",
    ),
    // 決定4: 分が戻ったら、時を進める
    ("minute_goes_back", "決定4: 分が戻ったら時を進める"),
    // 決定5: 黙って無視していたものを誤りにする
    ("ignored_extra_operand", "決定5: 余分な値は誤り"),
    (
        "ignored_keyword_mid_line",
        "決定5: 位置違いのキーワードは誤り",
    ),
    (
        "ignored_consecutive_first",
        "決定5: 行頭の consecutive は誤り",
    ),
    ("ignored_qslmsg_empty", "決定5: 値のない qslmsg は誤り"),
    ("unclosed_comment", "決定5: 閉じない括弧は誤り"),
    ("unclosed_angle_then_more", "決定5: 閉じない括弧は誤り"),
    (
        "stray_snr_in_qso_line",
        "決定5: RST のあとの余分なSNRは誤り",
    ),
    ("stray_date_in_qso_line", "決定5: QSOの行にある日付は誤り"),
    (
        "fullwidth_digits",
        "全角の数字・英字を、半角として読む(以前は桁数を誤って数え、黙って無視していた)",
    ),
    ("fullwidth_callsign", "全角の数字・英字を、半角として読む"),
    ("fullwidth_mixed", "全角の数字・英字を、半角として読む"),
    // 決定6: 平文の語は、大文字小文字を保ち、全部を保持する
    ("plain_one_word", "決定6: 平文の語は大文字小文字を保つ"),
    ("plain_two_words", "決定6: 平文の語は大文字小文字を保つ"),
    ("plain_three_words", "決定6: 平文の語を全部保持する"),
    ("plain_mixed_case", "決定6: 平文の語は大文字小文字を保つ"),
    ("plain_and_curly", "決定6: 平文の語を全部保持する"),
    // 決定7: バンドは小文字にそろえる
    ("band_uppercase", "決定7: バンドは小文字にそろえる"),
    // 決定8: コールサインのない行は誤り
    ("dropped_no_call", "決定8: コールサインのない行は誤り"),
    ("dropped_minutes_only", "決定8: コールサインのない行は誤り"),
    (
        "call_missing_letters_only",
        "決定8: コールサインのない行は誤り",
    ),
    // 決定15: RST の省略形は、モードのレポートの形に合わせて補う(CW の2桁に 9)
    ("rst_two_digits", "決定15: CW の2桁の RST に 9 を補う"),
];

fn golden_path() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/compile.json")
}

/// 比べる形: 誤りは `(行, メッセージ)` だけ。列は、意味が一定でなかった(旧実装)ので除く。
/// コード・引数・位置は、新実装で足したもので、`tests/syntax_errors.rs` 相当のテストで確かめる。
/// 記録の `rig`(決定10で、`rigset` の番号から、HAMLOG の Rig= の文字列に変えた)は、旧実装の形(`rigset`)に
/// そろえる。`rig` の挙動は、`tests/rig.rs` で確かめる
fn snapshot(text: &str) -> Value {
    let mut v = serde_json::to_value(compile_fle(text)).unwrap();
    if let Some(records) = v.get_mut("records").and_then(Value::as_array_mut) {
        for r in records {
            if let Some(o) = r.as_object_mut() {
                o.remove("rig");
                // 相手局のグリッド(QSOの行に書く)は、旧実装にない
                o.remove("his_grid");
                o.insert("rigset".to_string(), json!(0));
            }
        }
    }
    if let Some(errors) = v.get_mut("errors").and_then(Value::as_array_mut) {
        for e in errors {
            if let Some(o) = e.as_object_mut() {
                for key in ["column", "code", "args", "from", "to"] {
                    o.remove(key);
                }
            }
        }
    }
    v
}

#[test]
fn compile_matches_the_golden_record() {
    let all: Map<String, Value> = cases()
        .into_iter()
        .map(|(n, t)| (n.to_string(), snapshot(&t)))
        .collect();

    if std::env::var("UPDATE_GOLDEN").is_ok() {
        let json = serde_json::to_string_pretty(&Value::Object(all.clone())).unwrap() + "\n";
        std::fs::write(golden_path(), json).unwrap();
        let changed: Map<String, Value> = CHANGED
            .iter()
            .map(|(n, _)| (n.to_string(), all[*n].clone()))
            .collect();
        std::fs::write(
            changed_path(),
            serde_json::to_string_pretty(&Value::Object(changed)).unwrap() + "\n",
        )
        .unwrap();
        return;
    }

    let golden: Map<String, Value> =
        serde_json::from_str(&std::fs::read_to_string(golden_path()).expect("golden record"))
            .unwrap();
    assert_eq!(
        all.len(),
        golden.len(),
        "ケースの数が、記録と違う(記録を作り直す)"
    );

    let changed: std::collections::HashSet<&str> = CHANGED.iter().map(|(n, _)| *n).collect();

    // CHANGED に挙げたものは、実際に変わっているはず(変わっていなければ、例外が古い)
    let stale: Vec<&str> = CHANGED
        .iter()
        .map(|(n, _)| *n)
        .filter(|n| golden.get(*n) == all.get(*n))
        .collect();
    assert!(
        stale.is_empty(),
        "CHANGED にあるが、記録と同じケース(例外を外す): {stale:?}"
    );

    if std::env::var("SHOW_CHANGED").is_ok() {
        for (name, reason) in CHANGED {
            let (g, n) = (&golden[*name], &all[*name]);
            eprintln!("=== {name}  [{reason}]");
            for key in [
                "status", "mycall", "operator", "mysota", "mywwff", "mypota", "mygrid", "qslmsg",
                "log_type",
            ] {
                if g[key] != n[key] {
                    eprintln!("  {key}: {} -> {}", g[key], n[key]);
                }
            }
            let msgs = |v: &Value| {
                v["errors"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|e| format!("L{}:{}", e["line"], e["message"].as_str().unwrap()))
                    .collect::<Vec<_>>()
            };
            if msgs(g) != msgs(n) {
                eprintln!("  errors: {:?} -> {:?}", msgs(g), msgs(n));
            }
            let (gr, nr) = (
                g["records"].as_array().unwrap(),
                n["records"].as_array().unwrap(),
            );
            if gr.len() != nr.len() {
                eprintln!("  records: {} -> {}", gr.len(), nr.len());
            }
            for (i, (a, b)) in gr.iter().zip(nr).enumerate() {
                for (k, v) in a.as_object().unwrap() {
                    if b[k] != *v {
                        eprintln!("  record[{i}].{k}: {v} -> {}", b[k]);
                    }
                }
            }
        }
    }
    let mut diffs = Vec::new();
    for (name, now) in &all {
        if changed.contains(name.as_str()) {
            continue;
        }
        if golden.get(name) != Some(now) {
            diffs.push(name.clone());
        }
    }
    assert!(
        diffs.is_empty(),
        "記録と違うケース: {diffs:?}\n(意図した変更なら CHANGED に理由つきで足す)"
    );
    let _ = json!(null);

    // CHANGED は、新しい値を別の記録(changed.json)に固定する
    let now_changed: Map<String, Value> = CHANGED
        .iter()
        .map(|(n, _)| (n.to_string(), all[*n].clone()))
        .collect();
    let path = changed_path();
    if std::env::var("UPDATE_GOLDEN").is_ok() {
        std::fs::write(
            &path,
            serde_json::to_string_pretty(&Value::Object(now_changed)).unwrap() + "\n",
        )
        .unwrap();
        return;
    }
    let recorded: Map<String, Value> =
        serde_json::from_str(&std::fs::read_to_string(&path).expect("changed record")).unwrap();
    assert_eq!(
        recorded, now_changed,
        "意図した変更の記録(changed.json)と違う"
    );
}

fn changed_path() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden/changed.json")
}
