//! 画面表示用のコンパイル結果。
//!
//! 入力中に毎回呼ばれる前提で、QSOとエラーを「元の行番号つき」で返す。
//! 画面は行番号をたよりに、カーソルのある行の解釈(補完結果)を表示する。

use chrono::{Duration, NaiveDate};
use serde::Serialize;

use crate::compiler::compile_fle;
use crate::types::{FleCompileResult, FleQsoRecord};

/// FLEテキストをコンパイルして、表示用の形にする
pub fn compile_log(input: &str) -> LogView {
    compile_fle(input).into()
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LogView {
    /// "OK" または "ERR"
    pub status: String,
    pub mycall: String,
    pub operator: String,
    pub mysota: String,
    pub mywwff: String,
    pub mypota: Vec<String>,
    pub qsos: Vec<QsoView>,
    pub errors: Vec<ErrorView>,
}

/// 1QSO分。省略された時刻・バンド・モード・RSTは、前の行から補完済み。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QsoView {
    /// 元のテキストでの行番号(0始まり)
    pub line: usize,
    pub date: String,
    /// UTCでの時刻(`HH:MM`)
    pub time: String,
    /// このQSOのタイムゾーン(UTCからの時間差。UTC は 0)
    pub tz: i32,
    /// ログに書かれている形(そのタイムゾーンでの時刻、`HH:MM`)
    pub local_time: String,
    pub call: String,
    pub band: String,
    pub mode: String,
    pub freq: String,
    pub rst_sent: String,
    pub rst_rcvd: String,
    /// 相手局のリファレンス(SOTA / WWFF / POTA)
    pub refs: Vec<String>,
    pub comment: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ErrorView {
    /// 元のテキストでの行番号(0始まり)
    pub line: usize,
    pub message: String,
    /// 誤りの種類(画面が、言語ごとの文面を選ぶ鍵)
    pub code: String,
    /// 文面に入れる値
    pub args: Vec<String>,
    /// 誤りの範囲(テキスト全体での、UTF-16の文字位置)
    pub from: usize,
    pub to: usize,
}

impl From<&FleQsoRecord> for QsoView {
    fn from(q: &FleQsoRecord) -> Self {
        let refs = [&q.hissota, &q.hiswwff]
            .into_iter()
            .chain(q.hispota.iter())
            .filter(|r| !r.is_empty())
            .cloned()
            .collect();
        let comment = [q.qsomsg.as_str(), q.qsormks.as_str()]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");

        let utc = NaiveDate::from_ymd_opt(i32::from(q.year), u32::from(q.month), u32::from(q.day))
            .and_then(|d| d.and_hms_opt(u32::from(q.hour), u32::from(q.min), 0));
        let local_time = utc
            .map(|t| {
                (t + Duration::hours(i64::from(q.tz)))
                    .format("%H:%M")
                    .to_string()
            })
            .unwrap_or_default();

        Self {
            line: q.line,
            date: format!("{:04}-{:02}-{:02}", q.year, q.month, q.day),
            time: format!("{:02}:{:02}", q.hour, q.min),
            tz: q.tz,
            local_time,
            call: q.callsign.clone(),
            band: q.band.clone(),
            mode: q.mode.clone(),
            freq: q.freq.clone(),
            rst_sent: q.rst_sent.clone(),
            rst_rcvd: q.rst_rcvd.clone(),
            refs,
            comment,
        }
    }
}

impl From<FleCompileResult> for LogView {
    fn from(r: FleCompileResult) -> Self {
        Self {
            status: r.status,
            mycall: r.mycall,
            operator: r.operator,
            mysota: r.mysota,
            mywwff: r.mywwff,
            mypota: r.mypota,
            qsos: r.records.iter().map(QsoView::from).collect(),
            errors: r
                .errors
                .into_iter()
                .map(|e| ErrorView {
                    line: e.line,
                    message: e.message,
                    code: e.code,
                    args: e.args,
                    from: e.from,
                    to: e.to,
                })
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "mycall JA1ABC\ndate 2024-01-15\nmysota JA/TK-001\n40m cw\n0900 JA1XYZ 599 599\n05 JA1QSO 59 59 jaff-0218\n";

    #[test]
    fn qsos_know_their_source_line() {
        let view = compile_log(SAMPLE);
        assert_eq!(view.status, "OK");
        let lines: Vec<usize> = view.qsos.iter().map(|q| q.line).collect();
        assert_eq!(lines, vec![4, 5]);
    }

    #[test]
    fn qso_fields_are_formatted_for_display() {
        let q = &compile_log(SAMPLE).qsos[0];
        assert_eq!(q.date, "2024-01-15");
        assert_eq!(q.time, "09:00");
        assert_eq!(q.call, "JA1XYZ");
        assert_eq!(q.band, "40m");
        assert_eq!(q.mode, "CW");
        assert_eq!((q.rst_sent.as_str(), q.rst_rcvd.as_str()), ("599", "599"));
    }

    #[test]
    fn omitted_fields_are_completed_from_previous_lines() {
        // 2行目は「05」だけ。時(09)・バンド・モードは前の行から補完される
        let q = &compile_log(SAMPLE).qsos[1];
        assert_eq!(q.time, "09:05");
        assert_eq!(q.band, "40m");
        assert_eq!(q.mode, "CW");
    }

    #[test]
    fn time_is_given_in_utc_and_in_the_log_timezone() {
        // 18:05(+9) は 09:05Z
        let q = &compile_log("timezone +9\n40m cw\n1805 ja1xyz").qsos[0];
        assert_eq!(
            (q.time.as_str(), q.local_time.as_str(), q.tz),
            ("09:05", "18:05", 9)
        );
    }

    #[test]
    fn without_a_timezone_both_times_are_utc() {
        let q = &compile_log("40m cw\n0905 ja1xyz").qsos[0];
        assert_eq!(
            (q.time.as_str(), q.local_time.as_str(), q.tz),
            ("09:05", "09:05", 0)
        );
    }

    #[test]
    fn a_timezone_change_applies_from_that_line_on() {
        let v = compile_log("40m cw\n0900 ja1qso\ntimezone +9\n1805 ja1xyz");
        assert_eq!(v.qsos[0].tz, 0);
        assert_eq!((v.qsos[1].tz, v.qsos[1].local_time.as_str()), (9, "18:05"));
    }

    #[test]
    fn partner_references_are_listed() {
        let q = &compile_log(SAMPLE).qsos[1];
        assert!(q.refs.iter().any(|r| r.eq_ignore_ascii_case("jaff-0218")));
    }

    #[test]
    fn errors_carry_their_line() {
        let view = compile_log("mycall JA1ABC\nmysota\n");
        assert_eq!(view.status, "ERR");
        assert!(view.qsos.is_empty());
        assert_eq!(view.errors.len(), 1);
        assert_eq!(view.errors[0].line, 1);
        assert_eq!(view.errors[0].message, "Missing SOTA ref#.");
    }

    #[test]
    fn serializes_with_camel_case_names() {
        let json = serde_json::to_value(compile_log(SAMPLE)).unwrap();
        assert!(json["qsos"][0].get("rstSent").is_some());
        assert!(json["qsos"][0].get("rstRcvd").is_some());
        assert!(json.get("errors").is_some());
    }
}
