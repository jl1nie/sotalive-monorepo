//! 画面表示用のコンパイル結果 (FLE Online の「変換」結果テーブル)
//!
//! sotaapp2 の `/api/v2/fle/compile` が返していた JSON と同じ形。

use serde::Serialize;

use crate::compiler::compile_fle;
use crate::types::FleCompileResult;

/// FLEテキストをコンパイルして表示用の形にする
pub fn compile_view(input: &str) -> FleCompileResponse {
    compile_fle(input).into()
}

#[derive(Debug, Serialize)]
pub struct FleCompileResponse {
    pub status: String,
    #[serde(rename = "logtype")]
    pub log_type: String,
    pub mycall: String,
    pub operator: String,
    pub mysota: String,
    pub mywwff: String,
    pub mypota: Vec<String>,
    pub qslmsg: String,
    #[serde(rename = "logtext", skip_serializing_if = "Vec::is_empty")]
    pub log_text: Vec<Vec<String>>,
    #[serde(rename = "hamlogtext", skip_serializing_if = "Vec::is_empty")]
    pub hamlog_text: Vec<Vec<String>>,
}

impl From<FleCompileResult> for FleCompileResponse {
    fn from(result: FleCompileResult) -> Self {
        // QSOレコードを表形式に変換
        let log_text: Vec<Vec<String>> = if result.errors.is_empty() {
            result
                .records
                .iter()
                .enumerate()
                .map(|(i, qso)| {
                    vec![
                        (i + 1).to_string(),
                        qso.mycall.clone(),
                        format!("{:04}-{:02}-{:02}", qso.year, qso.month, qso.day),
                        format!("{:02}:{:02}", qso.hour, qso.min),
                        qso.callsign.clone(),
                        qso.band.clone(),
                        qso.mode.clone(),
                        qso.rst_sent.clone(),
                        qso.rst_rcvd.clone(),
                        qso.mysota.clone(),
                        qso.hissota.clone(),
                        qso.mypota.join("/"),
                        qso.hispota.join("/"),
                        format!("{}{}", qso.qsomsg, qso.qsormks),
                        qso.operator.clone(),
                    ]
                })
                .collect()
        } else {
            // エラー時はエラーログを返す
            result
                .errors
                .iter()
                .map(|e| vec![e.line.to_string(), e.message.clone(), String::new()])
                .collect()
        };

        // HAMLOG形式のログテキスト
        let hamlog_text: Vec<Vec<String>> = if result.errors.is_empty() {
            result
                .records
                .iter()
                .enumerate()
                .map(|(i, qso)| {
                    let rmks = crate::ham::get_ref(&qso.qsormks);
                    vec![
                        (i + 1).to_string(),
                        qso.callsign.clone(),
                        format!("{:04}-{:02}-{:02}", qso.year, qso.month, qso.day),
                        format!("{:02}:{:02}U", qso.hour, qso.min),
                        qso.rst_sent.clone(),
                        qso.rst_rcvd.clone(),
                        qso.freq.clone(),
                        qso.mode.clone(),
                        rmks.loc_org.to_string(),
                        qso.qsomsg.clone(),
                        String::new(),
                        String::new(),
                    ]
                })
                .collect()
        } else {
            result
                .errors
                .iter()
                .map(|e| vec![e.line.to_string(), e.message.clone(), String::new()])
                .collect()
        };

        FleCompileResponse {
            status: result.status,
            log_type: result.log_type,
            mycall: result.mycall,
            operator: result.operator,
            mysota: result.mysota,
            mywwff: result.mywwff,
            mypota: result.mypota,
            qslmsg: result.qslmsg,
            log_text,
            hamlog_text,
        }
    }
}

/// FLEコンパイルハンドラー (JSON応答)
///
#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str =
        "mycall JA1ABC\ndate 2024-01-15\nmysota JA/TK-001\n40m cw\n0900 JA1XYZ 599 599\n";

    #[test]
    fn test_compile_view_ok() {
        let view = compile_view(SAMPLE);
        assert_eq!(view.status, "OK");
        assert_eq!(view.mycall, "JA1ABC");
        assert_eq!(view.log_text.len(), 1);
        let row = &view.log_text[0];
        assert_eq!(row[0], "1");
        assert_eq!(row[2], "2024-01-15");
        assert_eq!(row[3], "09:00");
        assert_eq!(row[4], "JA1XYZ");
        assert_eq!(view.hamlog_text[0][3], "09:00U");
    }

    #[test]
    fn test_compile_view_serializes_legacy_field_names() {
        let json = serde_json::to_value(compile_view(SAMPLE)).unwrap();
        assert!(json.get("logtype").is_some());
        assert!(json.get("logtext").is_some());
        assert!(json.get("hamlogtext").is_some());
    }

    #[test]
    fn test_compile_view_error_rows_have_line_and_message() {
        let view = compile_view("mycall\n");
        assert_eq!(view.status, "ERR");
        assert_eq!(view.log_text, vec![vec!["0", "Missing operand.", ""]]);
        assert_eq!(view.hamlog_text, view.log_text);
    }
}
