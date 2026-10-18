//! FLE出力フォーマッタ
//!
//! SOTA CSV, POTA ADIF, HAMLOG CSV, AirHam CSV, ZLOG形式への変換

use std::collections::HashMap;
use std::io::Write;

use chrono::{FixedOffset, NaiveDate, TimeZone};
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

    // ファイル名のプレフィックス
    let first = &result.records[0];
    let date_str = format!("{:04}{:02}{:02}", first.year, first.month, first.day);
    let mut ref_parts = Vec::new();
    if !result.mysota.is_empty() {
        ref_parts.push(result.mysota.replace('/', "-"));
    }
    for p in &result.mypota {
        ref_parts.push(p.clone());
    }
    if !result.mywwff.is_empty() {
        ref_parts.push(result.mywwff.clone());
    }
    let log_name = format!("{}@{}", date_str, ref_parts.join("-"));

    // HAMLOG CSV
    let hamlog_data = generate_hamlog_csv(result);
    files.insert(format!("hamlog-{}.csv", log_name), hamlog_data);

    // AirHam CSV
    let airham_data = generate_airham_csv(result);
    files.insert(format!("airham-{}.csv", log_name), airham_data);

    // SOTA CSV
    if result.has_sota {
        let (sota_data, s2s_data) = generate_sota_csv(result);
        files.insert(format!("sota{}.csv", date_str), sota_data);
        if !s2s_data.is_empty() {
            files.insert(format!("sota-s2s-{}.csv", date_str), s2s_data);
        }
    }

    // WWFF ADIF
    if result.has_wwff && !result.mywwff.is_empty() {
        let adif_data = generate_adif(result, "WWFF", &result.mywwff);
        let fname = format!(
            "{}@{}-{}.adi",
            result.mycall.replace('/', "-"),
            result.mywwff,
            date_str
        );
        files.insert(fname, adif_data);
    }

    // POTA ADIF
    if result.has_pota {
        for park in &result.mypota {
            let adif_data = generate_adif(result, "POTA", park);
            let fname = format!(
                "{}@{}-{}.adi",
                result.mycall.replace('/', "-"),
                park,
                date_str
            );
            files.insert(fname, adif_data);
        }
    }

    // コンテストログ (ZLOG形式)
    if result.has_contest {
        let zlog_data = generate_zlog(result);
        files.insert(format!("contest-{}.txt", date_str), zlog_data);
    }

    // SOTAもWWFFもPOTAもない場合はSOTA形式で出力
    if !result.has_sota && !result.has_wwff && !result.has_pota && !result.has_contest {
        let (sota_data, _) = generate_sota_csv(result);
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
fn generate_sota_csv(result: &FleCompileResult) -> (Vec<u8>, Vec<u8>) {
    let mut output = Vec::new();
    let mut s2s_output = Vec::new();

    for record in &result.records {
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
fn generate_adif(result: &FleCompileResult, sig: &str, sig_info: &str) -> Vec<u8> {
    let mut output = String::new();

    // ヘッダー
    output.push_str("ADIF Export from HAMLOG by JL1NIE\n");
    output.push_str(&adif_field("PROGRAMID", "FCTH"));
    output.push('\n');
    output.push_str(&adif_field("ADIF_VER", "3.1.4"));
    output.push_str("\n<EOH>\n");

    for record in &result.records {
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

/// HAMLOG CSV形式を生成
fn generate_hamlog_csv(result: &FleCompileResult) -> Vec<u8> {
    let mut output = Vec::new();

    for record in &result.records {
        let date = format!(
            "{:02}/{:02}/{:02}",
            record.year % 100,
            record.month,
            record.day
        );
        let time = format!("{:02}:{:02}U", record.hour, record.min);
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

        // QSLメッセージ
        let qsl_msg = format!("%{}%", record.qslmsg);

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

        // Shift-JIS出力 (簡易実装としてUTF-8で出力)
        let row = fields
            .iter()
            .map(|f: &&str| format!("\"{}\"", f.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(",");
        output.extend(format!("{}\n", row).as_bytes());
    }

    output
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
            qslmsg: "TNX QSO".to_string(),
            records: vec![FleQsoRecord {
                mycall: "JA1ABC".to_string(),
                operator: "JA1ABC".to_string(),
                year: 2024,
                month: 1,
                day: 15,
                hour: 9,
                min: 0,
                callsign: "JA1XYZ".to_string(),
                band: "40m".to_string(),
                freq: "7.025".to_string(),
                mode: "CW".to_string(),
                rigset: 0,
                rst_sent: "599".to_string(),
                rst_rcvd: "599".to_string(),
                his_num: String::new(),
                my_num: String::new(),
                mysota: "JA/TK-001".to_string(),
                hissota: String::new(),
                mywwff: String::new(),
                hiswwff: String::new(),
                mypota: Vec::new(),
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
        let (csv, s2s) = generate_sota_csv(&result);
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

        let adif = generate_adif(&result, "POTA", "JA-0001");
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
}
