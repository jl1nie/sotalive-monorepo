//! fle-core のブラウザ向けバインディング。
//!
//! ロジックは `fle-core` にあり、ここは JS との値の受け渡しだけを担う。

use chrono::DateTime;
use fle_core::{
    adif_to_fle, compile_fle, compile_log, complete_at, fill_with, generate_fle_output, sample_log,
    FillScope,
};
use wasm_bindgen::prelude::*;

/// FLEテキストを変換し、行番号つきの表示用の結果(`qsos` / `errors` など)を返す。
#[wasm_bindgen]
pub fn compile(text: &str) -> Result<JsValue, JsError> {
    Ok(serde_wasm_bindgen::to_value(&compile_log(text))?)
}

/// カーソルより前のテキストから、次に入力できるキーワードの候補(`candidates`)と、
/// 確定するときに置き換える範囲の開始位置(`from`、UTF-16)を返す。
#[wasm_bindgen]
pub fn complete(text_before_caret: &str) -> Result<JsValue, JsError> {
    Ok(serde_wasm_bindgen::to_value(&complete_at(
        text_before_caret,
    ))?)
}

/// ADIFのテキストを、FLE形式のテキストに変換する。
#[wasm_bindgen(js_name = adifToFle)]
pub fn adif_to_fle_text(adif: &str) -> String {
    adif_to_fle(adif)
}

/// 書き方の見本になるFLEログ。`date` は `YYYY-MM-DD`。
#[wasm_bindgen(js_name = sampleLog)]
pub fn sample_log_text(date: &str) -> String {
    sample_log(date)
}

/// `line`(0始まり)の行を確定するための修正(`from` / `to` / `insert`)を返す。
///
/// 位置はUTF-16の文字位置。`now_ms` は `Date.now()` の値、`default_tz` は設定の既定の
/// タイムゾーン(UTCからの時間差)。時刻の挿入は常に行い、`options`
/// (`{ expandTime, bandMode, rst }`、省略可)で、それ以外に何を確定するかを選ぶ。
#[wasm_bindgen]
pub fn fill(
    text: &str,
    line: usize,
    now_ms: f64,
    default_tz: i32,
    options: JsValue,
) -> Result<JsValue, JsError> {
    let scope: FillScope = if options.is_undefined() || options.is_null() {
        FillScope::TIME
    } else {
        serde_wasm_bindgen::from_value(options)?
    };
    Ok(serde_wasm_bindgen::to_value(&fill_with(
        text,
        line,
        now_ms as i64,
        default_tz,
        scope,
    ))?)
}

/// FLEテキストから各種ログファイルを含むZIPを生成する。
///
/// `now_ms` は `Date.now()` の値。エラーログのファイル名に使う。
#[wasm_bindgen(js_name = generateZip)]
pub fn generate_zip(text: &str, now_ms: f64) -> Result<Vec<u8>, JsError> {
    generate_zip_bytes(text, now_ms).map_err(|e| JsError::new(&e))
}

fn generate_zip_bytes(text: &str, now_ms: f64) -> Result<Vec<u8>, String> {
    let now = DateTime::from_timestamp_millis(now_ms as i64)
        .ok_or_else(|| "invalid timestamp".to_string())?
        .naive_utc();
    generate_fle_output(&compile_fle(text), now)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    const SAMPLE: &str =
        "mycall JA1ABC\ndate 2024-01-15\nmysota JA/TK-001\n40m cw\n0900 JA1XYZ 599 599\n";

    #[test]
    fn zip_contains_log_files() {
        let zip = generate_zip_bytes(SAMPLE, 0.0).unwrap();
        let archive = zip::ZipArchive::new(Cursor::new(zip)).unwrap();
        assert!(archive.len() >= 2);
    }

    #[test]
    fn error_zip_is_named_from_given_time() {
        // 2026-10-18T09:30:45Z
        let zip = generate_zip_bytes("mycall\n", 1_792_315_845_000.0).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(zip)).unwrap();
        assert_eq!(
            archive.by_index(0).unwrap().name(),
            "fle-error-2026-10-18-09-30.txt"
        );
    }

    #[test]
    fn empty_input_is_an_error() {
        assert!(generate_zip_bytes("", 0.0).is_err());
    }
}
