//! FLE出力フォーマッタ
//!
//! SOTA CSV, POTA ADIF, HAMLOG CSV, AirHam CSV, ZLOG形式への変換

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use std::io::Write;

use chrono::{Datelike, FixedOffset, NaiveDate, TimeZone, Timelike};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use super::types::{FleCompileResult, FleQsoRecord};
use crate::ham::{
    band_to_freq, get_ref, mode_to_adif_mode, mode_to_airham_mode, mode_to_sota_mode,
    split_callsign,
};

/// 出力ファイルマップ
pub type OutputFiles = HashMap<String, Vec<u8>>;

/// FLE結果を各種形式に変換してZIPを生成
pub fn generate_fle_output(
    result: &FleCompileResult,
    now: chrono::NaiveDateTime,
) -> Result<Vec<u8>, String> {
    let mut files: OutputFiles = HashMap::new();

    // エラーがある場合はエラーログのみ
    if !result.errors.is_empty() {
        let error_log = format_error_log(result);
        let timestamp = now.format("%Y-%m-%d-%H-%M");
        files.insert(
            format!("fle-error-{}.txt", timestamp),
            error_log.into_bytes(),
        );
        return create_zip(&files);
    }

    if result.records.is_empty() {
        return Err("No records to output".to_string());
    }

    // ファイル名のプレフィックス: 最初の日付と、ログに現れた運用場所(現れた順)
    let first = &result.records[0];
    let date_str = date_key(first);
    let mut ref_parts: Vec<String> = Vec::new();
    for r in &result.records {
        let refs = std::iter::once(r.mysota.replace('/', "-"))
            .chain(r.mypota.iter().cloned())
            .chain(std::iter::once(r.mywwff.clone()));
        for part in refs.filter(|p| !p.is_empty()) {
            if !ref_parts.contains(&part) {
                ref_parts.push(part);
            }
        }
    }
    let log_name = format!("{}@{}", date_str, ref_parts.join("-"));

    // HAMLOG CSV
    let hamlog_data = generate_hamlog_csv(result);
    files.insert(format!("hamlog-{}.csv", log_name), hamlog_data);

    // AirHam CSV
    let airham_data = generate_airham_csv(result);
    files.insert(format!("airham-{}.csv", log_name), airham_data);

    // SOTA CSV: UTCの日付ごと。山のあるQSOだけ
    if result.has_sota {
        for (date, records) in group_by_date(result.records.iter().filter(|r| !r.mysota.is_empty()))
        {
            let (sota_data, s2s_data) = generate_sota_csv(&records);
            files.insert(format!("sota{}.csv", date), sota_data);
            if !s2s_data.is_empty() {
                files.insert(format!("sota-s2s-{}.csv", date), s2s_data);
            }
        }
    }

    // WWFF / POTA の ADIF: 運用場所(リファレンス)× UTCの日付ごとに、そのQSOだけで作る
    // (別の山や公園、別の日のQSOが混ざらない)
    for (sig, refs_of) in [
        ("WWFF", wwff_refs as fn(&FleQsoRecord) -> Vec<String>),
        ("POTA", pota_refs as fn(&FleQsoRecord) -> Vec<String>),
    ] {
        for (date, day) in group_by_date(result.records.iter()) {
            let mut placed: Vec<String> = Vec::new();
            for r in &day {
                for place in refs_of(r) {
                    if !placed.contains(&place) {
                        placed.push(place);
                    }
                }
            }
            for place in placed {
                let at_place: Vec<&FleQsoRecord> = day
                    .iter()
                    .copied()
                    .filter(|r| refs_of(r).contains(&place))
                    .collect();
                let adif_data = generate_adif(&at_place, sig, &place);
                let fname = format!(
                    "{}@{}-{}.adi",
                    at_place[0].mycall.replace('/', "-"),
                    place,
                    date
                );
                files.insert(fname, adif_data);
            }
        }
    }

    // コンテストログ (ZLOG形式)
    if result.has_contest {
        let zlog_data = generate_zlog(result);
        files.insert(format!("contest-{}.txt", date_str), zlog_data);
    }

    // SOTAもWWFFもPOTAもない場合はSOTA形式で出力
    if !result.has_sota && !result.has_wwff && !result.has_pota && !result.has_contest {
        let all: Vec<&FleQsoRecord> = result.records.iter().collect();
        let (sota_data, _) = generate_sota_csv(&all);
        files.insert(format!("sota{}.csv", date_str), sota_data);
    }

    create_zip(&files)
}

/// エラーログをフォーマット
fn format_error_log(result: &FleCompileResult) -> String {
    let mut log = String::from("####FLE Interpretation Error####\n");
    for err in &result.errors {
        log.push_str(&format!("Line {}: {}\n", err.line + 1, err.message));
    }
    log
}

/// SOTA CSV形式を生成
fn generate_sota_csv(records: &[&FleQsoRecord]) -> (Vec<u8>, Vec<u8>) {
    let mut output = Vec::new();
    let mut s2s_output = Vec::new();

    for record in records.iter().copied() {
        let date = format!(
            "{:02}/{:02}/{:02}",
            record.day,
            record.month,
            record.year % 100
        );
        let time = format!("{:02}:{:02}", record.hour, record.min);
        let freq = if record.freq.is_empty() {
            band_to_freq(&record.band, true)
                .unwrap_or_default()
                .to_string()
        } else {
            record.freq.clone()
        };

        let rmks = get_ref(&record.qsormks);
        let notes = format!("{}{}", rmks.loc, rmks.sat);

        let row = format!(
            "V2,{},{},{},{},{},{},{},{},{}\n",
            record.mycall,
            record.mysota,
            date,
            time,
            freq,
            mode_to_sota_mode(&record.mode),
            record.callsign,
            record.hissota,
            notes
        );

        output.extend(row.as_bytes());

        // S2S (Summit to Summit)
        if !record.hissota.is_empty() && !record.mysota.is_empty() {
            s2s_output.extend(row.as_bytes());
        }
    }

    (output, s2s_output)
}

/// ADIF形式を生成 (POTA/WWFF)
fn generate_adif(records: &[&FleQsoRecord], sig: &str, sig_info: &str) -> Vec<u8> {
    let mut output = String::new();

    // ヘッダー
    output.push_str("ADIF Export from HAMLOG by JL1NIE\n");
    output.push_str(&adif_field("PROGRAMID", "FCTH"));
    output.push('\n');
    output.push_str(&adif_field("ADIF_VER", "3.1.4"));
    output.push_str("\n<EOH>\n");

    for record in records.iter().copied() {
        let date = format!("{:04}{:02}{:02}", record.year, record.month, record.day);
        let time = format!("{:02}{:02}", record.hour, record.min);
        let (mode, submode) = mode_to_adif_mode(&record.mode);

        // 相手局のリファレンス
        let his_refs: Vec<&str> = match sig {
            "POTA" => record.hispota.iter().map(|s| s.as_str()).collect(),
            "WWFF" => {
                if record.hiswwff.is_empty() {
                    vec![]
                } else {
                    vec![record.hiswwff.as_str()]
                }
            }
            _ => vec![],
        };

        // 各リファレンスに対してレコードを生成
        if his_refs.is_empty() {
            let params = AdifRecordParams {
                record,
                sig,
                sig_info,
                his_sig: None,
                date: &date,
                time: &time,
                mode: &mode,
                submode: &submode,
            };
            output.push_str(&generate_adif_record(&params));
        } else {
            for his_ref in his_refs {
                let params = AdifRecordParams {
                    record,
                    sig,
                    sig_info,
                    his_sig: Some(his_ref),
                    date: &date,
                    time: &time,
                    mode: &mode,
                    submode: &submode,
                };
                output.push_str(&generate_adif_record(&params));
            }
        }
    }

    output.into_bytes()
}

/// 出力の前に知らせる、ログの不足(警告)。足りなくても生成はできる。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OutputWarning {
    /// `missing_mycall` / `missing_place` / `missing_grid`。文面は、画面が言語設定で作る
    pub code: &'static str,
    /// 入力する項目(`mycall` / `place` / `grid`)
    pub field: &'static str,
    /// 必須(これがないと、出力が不完全)か、あったほうがよい(推奨)か
    pub severity: Severity,
    /// 影響を受けるQSOの数
    pub qsos: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Severity {
    Required,
    Recommended,
}

/// ログを出力する前に、足りない情報を調べる。
///
/// - 日付(`date`): ないと、QSOの日付が 2000-01-01 になる(必須)。
/// - 自局のコールサイン(`mycall`): ないと、ADIF の `STATION_CALLSIGN` や SOTA CSV の自局が空になる(必須)。
/// - 運用場所(`mysota` / `mypota` / `mywwff`): 1つもないと、ADIF(POTA / WWFF)は作られない(推奨)。
/// - グリッド(`mygrid`): ADIF に入るQSOに、ないと `MY_GRIDSQUARE` が出ない(推奨)。
///
/// 誤りがあるログ(誤りの記録だけを出す)や、QSOがないログは、何も返さない。
pub fn check_output(result: &FleCompileResult) -> Vec<OutputWarning> {
    if !result.errors.is_empty() || result.records.is_empty() {
        return Vec::new();
    }
    let count =
        |pred: &dyn Fn(&FleQsoRecord) -> bool| result.records.iter().filter(|r| pred(r)).count();
    let mut warnings = Vec::new();

    let no_date = count(&|r| r.date_unset);
    if no_date > 0 {
        warnings.push(OutputWarning {
            code: "missing_date",
            field: "date",
            severity: Severity::Required,
            qsos: no_date,
        });
    }

    let no_mycall = count(&|r| r.mycall.is_empty());
    if no_mycall > 0 {
        warnings.push(OutputWarning {
            code: "missing_mycall",
            field: "mycall",
            severity: Severity::Required,
            qsos: no_mycall,
        });
    }

    let has_place =
        |r: &FleQsoRecord| !r.mysota.is_empty() || !r.mypota.is_empty() || !r.mywwff.is_empty();
    if !result.records.iter().any(has_place) {
        warnings.push(OutputWarning {
            code: "missing_place",
            field: "place",
            severity: Severity::Recommended,
            qsos: result.records.len(),
        });
    }

    // グリッドは、ADIF(POTA / WWFF)に入るQSOだけが対象(SOTAのCSVには、グリッドの列がない)
    let no_grid =
        count(&|r| (!r.mypota.is_empty() || !r.mywwff.is_empty()) && r.my_grid.is_empty());
    if no_grid > 0 {
        warnings.push(OutputWarning {
            code: "missing_grid",
            field: "grid",
            severity: Severity::Recommended,
            qsos: no_grid,
        });
    }
    warnings
}

/// `compile` してから `check_output` する。
pub fn check_log(text: &str) -> Vec<OutputWarning> {
    check_output(&crate::compile_fle(text))
}

/// UTCの日付(`YYYYMMDD`)
fn date_key(r: &FleQsoRecord) -> String {
    format!("{:04}{:02}{:02}", r.year, r.month, r.day)
}

/// QSOを、UTCの日付ごとに(日付の昇順で)分ける
fn group_by_date<'a>(
    records: impl Iterator<Item = &'a FleQsoRecord>,
) -> Vec<(String, Vec<&'a FleQsoRecord>)> {
    let mut groups: Vec<(String, Vec<&FleQsoRecord>)> = Vec::new();
    for r in records {
        let key = date_key(r);
        match groups.iter_mut().find(|(k, _)| *k == key) {
            Some((_, v)) => v.push(r),
            None => groups.push((key, vec![r])),
        }
    }
    groups.sort_by(|a, b| a.0.cmp(&b.0));
    groups
}

fn wwff_refs(r: &FleQsoRecord) -> Vec<String> {
    if r.mywwff.is_empty() {
        Vec::new()
    } else {
        vec![r.mywwff.clone()]
    }
}

fn pota_refs(r: &FleQsoRecord) -> Vec<String> {
    r.mypota.clone()
}

/// ADIFレコード生成パラメータ
struct AdifRecordParams<'a> {
    record: &'a FleQsoRecord,
    sig: &'a str,
    sig_info: &'a str,
    his_sig: Option<&'a str>,
    date: &'a str,
    time: &'a str,
    mode: &'a str,
    submode: &'a str,
}

/// ADIFレコードを生成
#[allow(clippy::vec_init_then_push)]
fn generate_adif_record(params: &AdifRecordParams<'_>) -> String {
    let mut fields = vec![
        adif_field("STATION_CALLSIGN", &params.record.mycall),
        adif_field("CALL", &params.record.callsign),
        adif_field("QSO_DATE", params.date),
        adif_field("TIME_ON", params.time),
        adif_band(&params.record.band),
        adif_field("MODE", params.mode),
    ];

    if !params.submode.is_empty() {
        fields.push(adif_field("SUBMODE", params.submode));
    }
    fields.push(adif_field("RST_SENT", &params.record.rst_sent));
    fields.push(adif_field("RST_RCVD", &params.record.rst_rcvd));
    fields.push(adif_field("MY_SIG", params.sig));
    fields.push(adif_field("MY_SIG_INFO", params.sig_info));
    fields.push(adif_field("MY_GRIDSQUARE", &params.record.my_grid));

    if let Some(his) = params.his_sig {
        fields.push(adif_field("SIG", params.sig));
        fields.push(adif_field("SIG_INFO", his));
    }

    if !params.record.operator.is_empty() {
        fields.push(adif_field("OPERATOR", &params.record.operator));
    }

    fields.push("<EOR>\n".to_string());

    fields.join(" ")
}

/// ADIFフィールドを生成
fn adif_field(name: &str, value: &str) -> String {
    if value.is_empty() {
        String::new()
    } else {
        format!("<{}:{}>{}", name, value.len(), value)
    }
}

/// ADIFバンドフィールドを生成
fn adif_band(band: &str) -> String {
    // バンドをADIF形式に変換 (40m -> 40M, 2m -> 2M)
    let band_upper = band.to_uppercase();
    format!("<BAND:{}>{}", band_upper.len(), band_upper)
}

/// HAMLOG の日付(`YY/MM/DD`)と時刻(`HH:MMU` か `HH:MMJ`)
///
/// 入力のときの時間帯(`timezone`)に従う。+9(`jst`)は JST で `J`(日付も JST に直す)。
/// HAMLOG の記号は `J` と `U` だけなので、それ以外(0 を含む)は UTC で `U`。
fn hamlog_date_time(record: &FleQsoRecord) -> (String, String) {
    let jst = record.tz == 9;
    let utc = NaiveDate::from_ymd_opt(record.year as i32, record.month as u32, record.day as u32)
        .and_then(|d| d.and_hms_opt(record.hour as u32, record.min as u32, 0));
    let (at, flag) = match (jst, utc) {
        (true, Some(t)) => (t + chrono::Duration::hours(9), 'J'),
        (_, Some(t)) => (t, 'U'),
        // 日時として読めないときは、記録の値のまま(UTC)
        (_, None) => {
            return (
                format!(
                    "{:02}/{:02}/{:02}",
                    record.year % 100,
                    record.month,
                    record.day
                ),
                format!("{:02}:{:02}U", record.hour, record.min),
            )
        }
    };
    (
        format!("{:02}/{:02}/{:02}", at.year() % 100, at.month(), at.day()),
        format!("{:02}:{:02}{}", at.hour(), at.minute(), flag),
    )
}

/// HAMLOG CSV形式を生成
fn generate_hamlog_csv(result: &FleCompileResult) -> Vec<u8> {
    let mut output = Vec::new();

    for record in &result.records {
        let (date, time) = hamlog_date_time(record);
        let freq = if record.freq.is_empty() {
            band_to_freq(&record.band, false)
                .unwrap_or_default()
                .to_string()
        } else {
            record.freq.clone()
        };

        // QTH/Remarks構築
        let rmks = get_ref(&record.qsormks);
        let mut his_refs = Vec::new();
        if !record.hissota.is_empty() {
            his_refs.push(record.hissota.clone());
        }
        if !record.hiswwff.is_empty() {
            his_refs.push(record.hiswwff.clone());
        }
        for p in &record.hispota {
            his_refs.push(p.clone());
        }

        let qth_str = format!("{} {}", rmks.org, his_refs.join(","))
            .trim()
            .to_string();

        // QSLメッセージ。`rig` があれば、`%…%` の外側に `Rig=` として付ける(HAMLOG の書式)
        let qsl_msg = if record.rig.is_empty() {
            format!("%{}%", record.qslmsg)
        } else {
            format!("%{}%Rig={}", record.qslmsg, record.rig)
        };

        // CSVフィールド
        let fields: [&str; 15] = [
            &record.callsign,
            &date,
            &time,
            &record.rst_sent,
            &record.rst_rcvd,
            &freq,
            &record.mode,
            "", // Code
            &rmks.loc_org,
            "", // GL
            &record.qsomsg,
            &qth_str,
            "", // Remarks1
            &qsl_msg,
            "0", // QSL
        ];

        let row = fields
            .iter()
            .map(|f: &&str| format!("\"{}\"", f.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(",");
        // HAMLOG(Windows)は、Shift_JIS(cp932)・CRLF で読む
        output.extend(to_cp932(&format!("{}\r\n", row)));
    }

    output
}

/// Shift_JIS(cp932)にする。表せない文字(絵文字など)は、旧実装(Python の `backslashreplace`)と同じく
/// `\u2603` / `\U0001f600` の形で残す(文字化けや、黙って消えるのを避ける)
fn to_cp932(s: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len());
    let mut buf = [0u8; 4];
    for c in s.chars() {
        let (bytes, _, unmappable) = encoding_rs::SHIFT_JIS.encode(c.encode_utf8(&mut buf));
        if unmappable {
            let code = u32::from(c);
            let escaped = match code {
                0..=0xff => format!("\\x{code:02x}"),
                0x100..=0xffff => format!("\\u{code:04x}"),
                _ => format!("\\U{code:08x}"),
            };
            out.extend(escaped.bytes());
        } else {
            out.extend_from_slice(&bytes);
        }
    }
    out
}

/// AirHam CSV形式を生成
fn generate_airham_csv(result: &FleCompileResult) -> Vec<u8> {
    let mut output = Vec::new();

    // ヘッダー
    let header = "id,callsign,portable,qso_at,sent_rst,received_rst,sent_qth,received_qth,received_qra,frequency,mode,card,remarks\n";
    output.extend(header.as_bytes());

    for record in &result.records {
        // ISO 8601形式の日時
        let dt =
            NaiveDate::from_ymd_opt(record.year as i32, record.month as u32, record.day as u32)
                .and_then(|d| d.and_hms_opt(record.hour as u32, record.min as u32, 0));
        let iso_time = dt
            .map(|t| {
                let utc = FixedOffset::east_opt(0).unwrap();
                utc.from_utc_datetime(&t).to_rfc3339()
            })
            .unwrap_or_default();

        let (operator, portable) = split_callsign(&record.callsign);

        let freq = band_to_freq(&record.band, false).unwrap_or_default();
        let freq_num = freq
            .replace("MHz", "")
            .replace("KHz", "")
            .replace("GHz", "");
        let mode = mode_to_airham_mode(&record.mode, &freq_num);

        // 受信QTH
        let mut his_refs = Vec::new();
        if !record.hissota.is_empty() {
            his_refs.push(record.hissota.clone());
        }
        if !record.hiswwff.is_empty() {
            his_refs.push(record.hiswwff.clone());
        }
        for p in &record.hispota {
            his_refs.push(p.clone());
        }
        let received_qth = format!("{} {}", his_refs.join(","), record.qsormks);

        let fields = [
            "", // id
            &operator,
            &portable,
            &iso_time,
            &record.rst_sent,
            &record.rst_rcvd,
            &record.qslmsg,
            received_qth.trim(),
            &record.qsomsg,
            freq,
            &mode,
            "", // card
            "", // remarks
        ];

        let row = fields
            .iter()
            .map(|f| {
                if f.contains(',') || f.contains('"') || f.contains('\n') {
                    format!("\"{}\"", f.replace('"', "\"\""))
                } else {
                    f.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join(",");
        output.extend(format!("{}\n", row).as_bytes());
    }

    output
}

/// ZLOG (コンテスト)形式を生成
fn generate_zlog(result: &FleCompileResult) -> Vec<u8> {
    let mut output = Vec::new();

    // ヘッダー
    let header = "DATE\tTIME\tBAND\tMODE\tCALLSIGN\tSENTNo\tRCVNo\n";
    output.extend(header.as_bytes());

    for record in &result.records {
        let date = format!("{}-{}-{}", record.year, record.month, record.day);
        let time = format!("{:02}:{:02}", record.hour, record.min);
        let freq = record.freq.replace("MHz", "");

        let row = format!(
            "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\n",
            date,
            time,
            freq,
            record.mode,
            record.callsign,
            record.rst_sent,
            record.his_num,
            record.rst_rcvd,
            record.my_num
        );
        output.extend(row.as_bytes());
    }

    output
}

/// ZIPファイルを生成
fn create_zip(files: &OutputFiles) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::new();
    {
        let mut zip = ZipWriter::new(std::io::Cursor::new(&mut buffer));
        let options = SimpleFileOptions::default();

        for (name, content) in files {
            zip.start_file(name, options)
                .map_err(|e| format!("Failed to create file in zip: {}", e))?;
            zip.write_all(content)
                .map_err(|e| format!("Failed to write to zip: {}", e))?;
        }

        zip.finish()
            .map_err(|e| format!("Failed to finish zip: {}", e))?;
    }
    Ok(buffer)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_result() -> FleCompileResult {
        FleCompileResult {
            status: "OK".to_string(),
            log_type: "SOTA".to_string(),
            mycall: "JA1ABC".to_string(),
            operator: "JA1ABC".to_string(),
            mysota: "JA/TK-001".to_string(),
            mywwff: String::new(),
            mypota: Vec::new(),
            mygrid: String::new(),
            qslmsg: "TNX QSO".to_string(),
            records: vec![FleQsoRecord {
                line: 0,
                tz: 0,
                mycall: "JA1ABC".to_string(),
                operator: "JA1ABC".to_string(),
                date_unset: false,
                year: 2024,
                month: 1,
                day: 15,
                hour: 9,
                min: 0,
                callsign: "JA1XYZ".to_string(),
                band: "40m".to_string(),
                freq: "7.025".to_string(),
                mode: "CW".to_string(),
                rig: String::new(),
                rst_sent: "599".to_string(),
                rst_rcvd: "599".to_string(),
                his_num: String::new(),
                my_num: String::new(),
                mysota: "JA/TK-001".to_string(),
                hissota: String::new(),
                mywwff: String::new(),
                hiswwff: String::new(),
                mypota: Vec::new(),
                my_grid: String::new(),
                hispota: Vec::new(),
                qsomsg: String::new(),
                qsormks: String::new(),
                qslmsg: "TNX QSO".to_string(),
            }],
            errors: Vec::new(),
            has_sota: true,
            has_wwff: false,
            has_pota: false,
            has_contest: false,
        }
    }

    #[test]
    fn test_generate_sota_csv() {
        let result = create_test_result();
        let records: Vec<&FleQsoRecord> = result.records.iter().collect();
        let (csv, s2s) = generate_sota_csv(&records);
        let csv_str = String::from_utf8(csv).unwrap();

        assert!(csv_str.contains("V2,JA1ABC,JA/TK-001"));
        assert!(csv_str.contains("7.025"));
        assert!(csv_str.contains("JA1XYZ"));
        assert!(s2s.is_empty());
    }

    #[test]
    fn test_generate_adif() {
        let mut result = create_test_result();
        result.mypota = vec!["JA-0001".to_string()];
        result.has_pota = true;

        let records: Vec<&FleQsoRecord> = result.records.iter().collect();
        let adif = generate_adif(&records, "POTA", "JA-0001");
        let adif_str = String::from_utf8(adif).unwrap();

        assert!(adif_str.contains("<PROGRAMID:4>FCTH"));
        assert!(adif_str.contains("<CALL:6>JA1XYZ"));
        assert!(adif_str.contains("<MY_SIG:4>POTA"));
        assert!(adif_str.contains("<MY_SIG_INFO:7>JA-0001"));
        assert!(adif_str.contains("<EOR>"));
    }

    #[test]
    fn test_generate_fle_output() {
        let result = create_test_result();
        let zip = generate_fle_output(&result, test_now());
        assert!(zip.is_ok());
    }

    fn test_now() -> chrono::NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(2026, 10, 18)
            .unwrap()
            .and_hms_opt(9, 30, 45)
            .unwrap()
    }

    #[test]
    fn test_error_log_name_uses_given_time() {
        let mut result = create_test_result();
        result
            .errors
            .push(crate::types::FleError::new(0, 0, "bad input"));
        let zip = generate_fle_output(&result, test_now()).unwrap();

        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip)).unwrap();
        assert_eq!(archive.len(), 1);
        assert_eq!(
            archive.by_index(0).unwrap().name(),
            "fle-error-2026-10-18-09-30.txt"
        );
    }

    // ---- 運用場所 × UTCの日付で、出力ファイルを分ける ----

    use crate::compile_fle;
    use std::io::Read;

    fn zip_files(zip: Vec<u8>) -> std::collections::BTreeMap<String, String> {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip)).unwrap();
        (0..archive.len())
            .map(|i| {
                let mut f = archive.by_index(i).unwrap();
                let mut body = Vec::new();
                f.read_to_end(&mut body).unwrap();
                // HAMLOG は Shift_JIS。ほかは UTF-8
                let text = if f.name().starts_with("hamlog-") {
                    encoding_rs::SHIFT_JIS.decode(&body).0.into_owned()
                } else {
                    String::from_utf8_lossy(&body).into_owned()
                };
                (f.name().to_string(), text)
            })
            .collect()
    }

    fn output_of(fle: &str) -> std::collections::BTreeMap<String, String> {
        let result = compile_fle(fle);
        assert!(result.errors.is_empty(), "{:?}", result.errors);
        zip_files(generate_fle_output(&result, test_now()).unwrap())
    }

    fn calls_in(adif: &str) -> Vec<&str> {
        adif.split("<CALL:")
            .skip(1)
            .map(|r| {
                r.split('>')
                    .nth(1)
                    .unwrap()
                    .split(' ')
                    .next()
                    .unwrap()
                    .trim()
            })
            .collect()
    }

    const TWO_PARKS: &str = "mycall JA1ABC\ndate 2026-10-18\n40m cw\n\
mygrid PM95uq\nmypota JA-0001\n0900 ja1aaa\n0910 ja1bbb\n\
mygrid PM96aa\nmypota JA-0002\n1100 ja1ccc\n1110 ja1ddd";

    #[test]
    fn each_park_gets_only_its_own_qsos() {
        let files = output_of(TWO_PARKS);
        let a = &files["JA1ABC@JA-0001-20261018.adi"];
        let b = &files["JA1ABC@JA-0002-20261018.adi"];
        assert_eq!(calls_in(a), vec!["JA1AAA", "JA1BBB"]);
        assert_eq!(calls_in(b), vec!["JA1CCC", "JA1DDD"]);
    }

    #[test]
    fn adif_carries_the_grid_of_that_location() {
        let files = output_of(TWO_PARKS);
        assert!(files["JA1ABC@JA-0001-20261018.adi"].contains("<MY_GRIDSQUARE:6>PM95uq"));
        assert!(files["JA1ABC@JA-0002-20261018.adi"].contains("<MY_GRIDSQUARE:6>PM96aa"));
        assert!(!files["JA1ABC@JA-0001-20261018.adi"].contains("PM96aa"));
    }

    #[test]
    fn adif_omits_the_grid_when_none_was_given() {
        let files =
            output_of("mycall JA1ABC\ndate 2026-10-18\n40m cw\nmypota JA-0001\n0900 ja1aaa");
        assert!(!files["JA1ABC@JA-0001-20261018.adi"].contains("MY_GRIDSQUARE"));
    }

    #[test]
    fn a_park_activated_on_two_utc_days_gets_one_file_per_day() {
        let files = output_of("mycall JA1ABC\ndate 2026-10-18\n40m cw\nmypota JA-0001\n2300 ja1aaa\nday +\n0010 ja1bbb");
        assert_eq!(
            calls_in(&files["JA1ABC@JA-0001-20261018.adi"]),
            vec!["JA1AAA"]
        );
        assert_eq!(
            calls_in(&files["JA1ABC@JA-0001-20261019.adi"]),
            vec!["JA1BBB"]
        );
    }

    #[test]
    fn qsos_after_leaving_a_park_are_not_in_its_file() {
        let files = output_of("mycall JA1ABC\ndate 2026-10-18\n40m cw\nmypota JA-0001\n0900 ja1aaa\nmypota -\n1000 ja1bbb");
        assert_eq!(
            calls_in(&files["JA1ABC@JA-0001-20261018.adi"]),
            vec!["JA1AAA"]
        );
        assert_eq!(files.keys().filter(|k| k.ends_with(".adi")).count(), 1);
    }

    #[test]
    fn two_parks_at_the_same_place_both_get_the_qsos() {
        let files = output_of(
            "mycall JA1ABC\ndate 2026-10-18\n40m cw\nmypota JA-0001 JA-0002\n0900 ja1aaa",
        );
        assert_eq!(
            calls_in(&files["JA1ABC@JA-0001-20261018.adi"]),
            vec!["JA1AAA"]
        );
        assert_eq!(
            calls_in(&files["JA1ABC@JA-0002-20261018.adi"]),
            vec!["JA1AAA"]
        );
    }

    #[test]
    fn wwff_is_split_by_place_too() {
        let files = output_of("mycall JA1ABC\ndate 2026-10-18\n40m cw\nmywwff JAFF-0001\n0900 ja1aaa\nmywwff JAFF-0002\n1000 ja1bbb");
        assert_eq!(
            calls_in(&files["JA1ABC@JAFF-0001-20261018.adi"]),
            vec!["JA1AAA"]
        );
        assert_eq!(
            calls_in(&files["JA1ABC@JAFF-0002-20261018.adi"]),
            vec!["JA1BBB"]
        );
    }

    #[test]
    fn sota_csv_has_only_qsos_made_on_a_summit_per_day() {
        let files = output_of("mycall JA1ABC\ndate 2026-10-18\n40m cw\nmysota JA/TK-001\n0900 ja1aaa\nmysota -\n1000 ja1bbb\nmysota JA/TK-002\n1100 ja1ccc");
        let csv = &files["sota20261018.csv"];
        assert!(csv.contains("JA/TK-001") && csv.contains("JA1AAA"));
        assert!(csv.contains("JA/TK-002") && csv.contains("JA1CCC"));
        assert!(!csv.contains("JA1BBB"), "山にいないときのQSOは入らない");
    }

    #[test]
    fn the_whole_log_still_goes_into_the_hamlog_and_airham_files() {
        let files = output_of(TWO_PARKS);
        let hamlog = files
            .iter()
            .find(|(k, _)| k.starts_with("hamlog-"))
            .unwrap()
            .1;
        for call in ["JA1AAA", "JA1BBB", "JA1CCC", "JA1DDD"] {
            assert!(hamlog.to_uppercase().contains(call), "{call}");
        }
        // ファイル名には、ログに現れた場所がすべて入る
        assert!(files
            .keys()
            .any(|k| k.starts_with("hamlog-20261018@JA-0001-JA-0002")));
    }

    #[test]
    fn digit_first_callsigns_come_out_in_every_file() {
        // 自局も相手も、数字で始まる局(7K1・8J1)
        let files = output_of(
            "mycall 7K1ABC/1\ndate 2026-10-18\n40m cw\nmypota JA-0001\n0900 8j1rl\n0910 7n4xyz",
        );
        let adif = &files["7K1ABC-1@JA-0001-20261018.adi"];
        assert!(adif.contains("<STATION_CALLSIGN:8>7K1ABC/1"), "{adif}");
        assert_eq!(calls_in(adif), vec!["8J1RL", "7N4XYZ"]);
        for (name, body) in &files {
            if name.starts_with("hamlog-") || name.starts_with("airham-") {
                assert!(
                    body.to_uppercase().contains("8J1RL") && body.to_uppercase().contains("7N4XYZ"),
                    "{name}"
                );
            }
        }
    }

    /// HAMLOG のファイルの、そのままのバイト列
    fn hamlog_bytes(fle: &str) -> Vec<u8> {
        let result = compile_fle(fle);
        let zip = generate_fle_output(&result, test_now()).unwrap();
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip)).unwrap();
        let name = archive
            .file_names()
            .find(|n| n.starts_with("hamlog-"))
            .unwrap()
            .to_string();
        let mut body = Vec::new();
        archive
            .by_name(&name)
            .unwrap()
            .read_to_end(&mut body)
            .unwrap();
        body
    }

    #[test]
    fn the_hamlog_file_is_shift_jis_with_crlf() {
        let body = hamlog_bytes(
            "mycall JA1ABC\ndate 2026-10-18\n40m cw\nmysota JA/TK-001\n0900 ja1aaa <曽田さん>{島根市}\n0910 ja1bbb",
        );
        assert!(std::str::from_utf8(&body).is_err(), "UTF-8 ではない");
        let (sjis, _, _) = encoding_rs::SHIFT_JIS.encode("曽田さん");
        assert!(
            body.windows(sjis.len()).any(|w| w == &sjis[..]),
            "曽田さんが Shift_JIS で入る"
        );
        let (text, _, had_errors) = encoding_rs::SHIFT_JIS.decode(&body);
        assert!(!had_errors);
        assert!(
            text.contains("\"曽田さん\"") && text.contains("島根市"),
            "{text}"
        );
        assert_eq!(text.matches("\r\n").count(), 2, "行の区切りは CRLF");
        assert!(!text.replace("\r\n", "").contains('\n'));
    }

    #[test]
    fn characters_shift_jis_lacks_are_kept_as_escapes() {
        // 旧実装(Python の backslashreplace)と同じ形
        assert_eq!(
            to_cp932("A☃😀①"),
            [&b"A\\u2603\\U0001f600"[..], &[0x87, 0x40]].concat()
        );
    }

    // ---- 出力前の警告(check_output) ----

    fn codes(fle: &str) -> Vec<(&'static str, usize)> {
        check_log(fle).iter().map(|w| (w.code, w.qsos)).collect()
    }

    const FULL: &str = "mycall JA1ABC\ndate 2026-10-18\n40m cw\nmypota JP-0117\nmygrid PM95pp\n0900 ja1aaa\n0910 ja1bbb";

    #[test]
    fn a_complete_log_has_no_warnings() {
        assert!(check_log(FULL).is_empty());
    }

    #[test]
    fn a_log_without_a_date_warns_first() {
        assert_eq!(
            codes("mycall JA1ABC\n40m cw\nmysota JA/TK-001\n0900 ja1aaa\n0910 ja1bbb"),
            vec![("missing_date", 2)]
        );
        assert!(
            codes("mycall JA1ABC\ndate 2026-10-18\n40m cw\nmysota JA/TK-001\n0900 ja1aaa")
                .is_empty()
        );
    }

    #[test]
    fn a_missing_mycall_is_required() {
        let w = check_log(
            "date 2026-10-18\n40m cw\nmypota JP-0117\nmygrid PM95pp\n0900 ja1aaa\n0910 ja1bbb",
        );
        assert_eq!(w.len(), 1);
        assert_eq!(
            (w[0].code, w[0].field, w[0].severity, w[0].qsos),
            ("missing_mycall", "mycall", Severity::Required, 2)
        );
    }

    #[test]
    fn a_log_without_any_place_warns_that_no_adif_is_made() {
        assert_eq!(
            codes("mycall JA1ABC\ndate 2026-10-18\n40m cw\n0900 ja1aaa"),
            vec![("missing_place", 1)]
        );
    }

    #[test]
    fn a_pota_log_without_a_grid_warns_about_the_grid() {
        let w = check_log("mycall JA1ABC\ndate 2026-10-18\n40m cw\nmypota JP-0117\n0900 ja1aaa");
        assert_eq!(
            (w[0].code, w[0].severity),
            ("missing_grid", Severity::Recommended)
        );
    }

    #[test]
    fn a_sota_only_log_does_not_need_a_grid() {
        // SOTAのCSVには、グリッドの列がない
        assert!(
            check_log("mycall JA1ABC\ndate 2026-10-18\n40m cw\nmysota JA/TK-001\n0900 ja1aaa")
                .is_empty()
        );
    }

    #[test]
    fn only_the_qsos_that_go_into_an_adif_count_for_the_grid() {
        // 山(SOTA)で2件、公園(POTA)で1件。グリッドがないのは、公園の1件だけが対象
        let fle = "mycall JA1ABC\ndate 2026-10-18\n40m cw\nmysota JA/TK-001\n0900 ja1aaa\n0910 ja1bbb\nmysota -\nmypota JP-0117\n1000 ja1ccc";
        assert_eq!(codes(fle), vec![("missing_grid", 1)]);
    }

    #[test]
    fn the_second_place_without_a_grid_is_counted() {
        let fle = "mycall JA1ABC\ndate 2026-10-18\n40m cw\nmypota JP-0117\nmygrid PM95pp\n0900 ja1aaa\nmypota JP-0118\nmygrid -\n1000 ja1bbb\n1010 ja1ccc";
        assert_eq!(codes(fle), vec![("missing_grid", 2)]);
    }

    #[test]
    fn several_warnings_come_in_a_fixed_order() {
        assert_eq!(
            codes("date 2026-10-18\n40m cw\n0900 ja1aaa"),
            vec![("missing_mycall", 1), ("missing_place", 1)]
        );
        assert_eq!(
            codes("date 2026-10-18\n40m cw\nmypota JP-0117\n0900 ja1aaa"),
            vec![("missing_mycall", 1), ("missing_grid", 1)]
        );
    }

    #[test]
    fn logs_with_errors_or_without_qsos_have_no_warnings() {
        assert!(check_log("").is_empty());
        assert!(check_log("mycall JA1ABC\n").is_empty());
        assert!(check_log("mycall\n40m cw\n0900 ja1aaa").is_empty()); // 指令の誤り
    }

    #[test]
    fn serializes_with_the_code_and_camel_case_severity() {
        let json = serde_json::to_value(check_log("date 2026-10-18\n40m cw\n0900 ja1aaa")).unwrap();
        assert_eq!(json[0]["code"], "missing_mycall");
        assert_eq!(json[0]["severity"], "required");
        assert_eq!(json[0]["qsos"], 1);
    }

    // ---- rig(HAMLOG の Rig=)と $rig ----

    const RIG_LOG: &str = "mycall JA1ABC\ndate 2026-10-18\n40m cw\nmysota JA/TK-001\n\
        qslmsg TNX QSO $rig\n0900 ja1aaa\nrig KX2/IC-705+EFHW\n0910 ja1bbb\nrig -\n0920 ja1ccc";

    fn hamlog_lines(files: &std::collections::BTreeMap<String, String>) -> Vec<String> {
        let (_, body) = files
            .iter()
            .find(|(k, _)| k.starts_with("hamlog-"))
            .unwrap();
        body.lines().map(str::to_string).collect()
    }

    #[test]
    fn rig_goes_after_the_qsl_message_in_the_hamlog_file() {
        let lines = hamlog_lines(&output_of(RIG_LOG));
        // rig の前の QSO には、Rig= も、メッセージの $rig の値もない(`$rig` は空に置き換わる)
        assert!(lines[0].ends_with(",\"%TNX QSO%\",\"0\""), "{}", lines[0]);
        // rig のある QSO: メッセージの $rig と、`%…%` の外側の Rig=
        assert!(
            lines[1].contains("\"%TNX QSO KX2/IC-705+EFHW%Rig=KX2/IC-705+EFHW\""),
            "{}",
            lines[1]
        );
        // `rig -` で解除すると、以降は、どちらもない
        assert!(!lines[2].contains("Rig="), "{}", lines[2]);
    }

    #[test]
    fn rig_is_only_in_the_hamlog_file_and_the_message() {
        let files = output_of(RIG_LOG);
        for (name, body) in &files {
            let in_hamlog = name.starts_with("hamlog-");
            let in_airham = name.starts_with("airham-");
            // ADIF・SOTA の CSV には、rig は出ない(HAMLOG の Rig= と、メッセージの $rig の置き換えだけ)
            if !in_hamlog && !in_airham {
                assert!(!body.contains("KX2/IC-705+EFHW"), "{name}");
            }
        }
        // AirHam には、メッセージ(置き換えた $rig を含む)が入る
        let airham = files
            .iter()
            .find(|(k, _)| k.starts_with("airham-"))
            .unwrap()
            .1;
        assert!(airham.contains("TNX QSO KX2/IC-705+EFHW"));
    }

    // ---- HAMLOG の日時(入力の時間帯 timezone に従う)----

    /// 同じ2つの交信(UTC の 2026-10-18 15:30 と 08:00)を、時間帯ごとに、その時間帯の時刻で書いたログ
    fn log_in(zone: &str) -> &'static str {
        match zone {
            // 時間帯なし(UTC)
            "utc" => "mycall JA1ABC\ndate 2026-10-18\n40m cw\nmysota JA/TK-001\n1530 ja1aaa\n0800 ja1bbb",
            // JST で書く。15:30 UTC は、JST では翌日 00:30。08:00 UTC は、同じ日の 17:00
            "jst" => "mycall JA1ABC\ndate 2026-10-19\ntimezone jst\n40m cw\nmysota JA/TK-001\n0030 ja1aaa\ndate 2026-10-18\n1700 ja1bbb",
            // +8 で書く: 23:30 と 16:00
            _ => "mycall JA1ABC\ndate 2026-10-18\ntimezone +8\n40m cw\nmysota JA/TK-001\n2330 ja1aaa\n1600 ja1bbb",
        }
    }

    fn hamlog_times(files: &std::collections::BTreeMap<String, String>) -> Vec<(String, String)> {
        hamlog_lines(files)
            .iter()
            .map(|l| {
                let cols: Vec<&str> = l.split("\",\"").collect();
                (cols[1].to_string(), cols[2].to_string())
            })
            .collect()
    }

    #[test]
    fn hamlog_times_are_utc_when_the_log_has_no_timezone() {
        let t = hamlog_times(&output_of(log_in("utc")));
        assert_eq!(
            t,
            [
                ("26/10/18".into(), "15:30U".into()),
                ("26/10/18".into(), "08:00U".into())
            ]
        );
    }

    #[test]
    fn hamlog_times_are_jst_when_the_log_is_written_in_jst() {
        // JST で書いた 10/19 00:30 は、UTC では 10/18 15:30。HAMLOG には、書いたとおりの JST で出る
        let t = hamlog_times(&output_of(log_in("jst")));
        assert_eq!(
            t,
            [
                ("26/10/19".into(), "00:30J".into()),
                ("26/10/18".into(), "17:00J".into())
            ]
        );
    }

    #[test]
    fn other_time_zones_go_to_hamlog_in_utc() {
        // +8 の 23:30 は UTC の 15:30(HAMLOG に +8 の記号はない)
        let t = hamlog_times(&output_of(log_in("+8")));
        assert_eq!(
            t,
            [
                ("26/10/18".into(), "15:30U".into()),
                ("26/10/18".into(), "08:00U".into())
            ]
        );
    }

    #[test]
    fn the_other_outputs_stay_utc_whatever_the_log_zone() {
        // JST で書いても、POTA の ADIF は UTC
        let files = output_of(&log_in("jst").replace("mysota JA/TK-001", "mypota JP-0117"));
        let adif = files.iter().find(|(k, _)| k.ends_with(".adi")).unwrap().1;
        assert!(
            adif.contains("<QSO_DATE:8>20261018 <TIME_ON:4>1530"),
            "{adif}"
        );
    }

    #[test]
    fn jst_rolls_the_month_and_the_year_back_into_the_utc_values() {
        // JST 2027-01-01 01:00 = UTC 2026-12-31 16:00
        let t = hamlog_times(&output_of(
            "mycall JA1ABC\ndate 2027-01-01\ntimezone jst\n40m cw\nmysota JA/TK-001\n0100 ja1aaa",
        ));
        assert_eq!(t, [("27/01/01".into(), "01:00J".into())]);
    }
}
