//! fle-core のブラウザ向けバインディング。
//!
//! ロジックは `fle-core` にあり、ここは JS との値の受け渡しだけを担う。

use chrono::DateTime;
use fle_core::{
    adif_to_fle, check_log, compile_fle, compile_log, complete_at, fill_with, generate_fle_output,
    grid_locator, sample_log, station_at, station_plan, FillScope, OutputOptions, Station,
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

/// `line`(0始まり)の行の直前までで有効な、自局と運用場所(`mycall` / `sota` / `pota` / `wwff` / `grid`)。
#[wasm_bindgen(js_name = stationAt)]
pub fn station_at_line(text: &str, line: usize) -> Result<JsValue, JsError> {
    Ok(serde_wasm_bindgen::to_value(&station_at(text, line))?)
}

/// 自局と運用場所を、ログに書き込む修正(`edits`)と、入力の誤り(`errors`)にする。
#[wasm_bindgen(js_name = stationPlan)]
pub fn station_plan_for(text: &str, line: usize, want: JsValue) -> Result<JsValue, JsError> {
    let want: Station = serde_wasm_bindgen::from_value(want)?;
    Ok(serde_wasm_bindgen::to_value(&station_plan(
        text, line, &want,
    ))?)
}

/// 緯度・経度から、6文字のグリッドロケータを求める。範囲外なら `undefined`。
#[wasm_bindgen(js_name = gridLocator)]
pub fn grid_locator_of(lat: f64, lon: f64) -> Option<String> {
    grid_locator(lat, lon)
}

/// ログを出力する前に、足りない情報(自局のコールサイン・運用場所・グリッド)を調べる。
/// 各項目は `code` / `field` / `severity`(`required` / `recommended`)/ `qsos` を持つ。
#[wasm_bindgen(js_name = checkOutput)]
pub fn check_output_of(text: &str) -> Result<JsValue, JsError> {
    Ok(serde_wasm_bindgen::to_value(&check_log(text))?)
}

/// FLEテキストから各種ログファイルを含むZIPを生成する。
///
/// `now_ms` は `Date.now()` の値。エラーログのファイル名に使う。
/// `options` は `{ hamlogJst?: boolean }`(省略できる)。HAMLOG の CSV の日時を JST で出すかどうか。
#[wasm_bindgen(js_name = generateZip)]
pub fn generate_zip(text: &str, now_ms: f64, options: Option<JsValue>) -> Result<Vec<u8>, JsError> {
    // 渡されなかった(undefined)・読めないときは、既定の設定
    let options: OutputOptions = options
        .and_then(|o| serde_wasm_bindgen::from_value(o).ok())
        .unwrap_or_default();
    generate_zip_bytes(text, now_ms, options).map_err(|e| JsError::new(&e))
}

fn generate_zip_bytes(text: &str, now_ms: f64, options: OutputOptions) -> Result<Vec<u8>, String> {
    let now = DateTime::from_timestamp_millis(now_ms as i64)
        .ok_or_else(|| "invalid timestamp".to_string())?
        .naive_utc();
    generate_fle_output(&compile_fle(text), now, options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    const SAMPLE: &str =
        "mycall JA1ABC\ndate 2024-01-15\nmysota JA/TK-001\n40m cw\n0900 JA1XYZ 599 599\n";

    #[test]
    fn zip_contains_log_files() {
        let zip = generate_zip_bytes(SAMPLE, 0.0, OutputOptions::default()).unwrap();
        let archive = zip::ZipArchive::new(Cursor::new(zip)).unwrap();
        assert!(archive.len() >= 2);
    }

    #[test]
    fn error_zip_is_named_from_given_time() {
        // 2026-10-18T09:30:45Z
        let zip =
            generate_zip_bytes("mycall\n", 1_792_315_845_000.0, OutputOptions::default()).unwrap();
        let mut archive = zip::ZipArchive::new(Cursor::new(zip)).unwrap();
        assert_eq!(
            archive.by_index(0).unwrap().name(),
            "fle-error-2026-10-18-09-30.txt"
        );
    }

    #[test]
    fn empty_input_is_an_error() {
        assert!(generate_zip_bytes("", 0.0, OutputOptions::default()).is_err());
    }
}
