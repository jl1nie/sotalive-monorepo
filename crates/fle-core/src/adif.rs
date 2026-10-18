//! ADIF → FLE の変換(ログの追記用)。
//!
//! FLE の書式(`date …`、`40m CW`、`HHMM CALL RST RST`)を知っているのはコアだけなので、
//! 変換もここに置く。画面は、ADIF のテキストを渡して、FLE のテキストを受け取る。

/// ADIFのレコード1件分のフィールド(名前は大文字)
fn parse_fields(record: &[char]) -> Vec<(String, String)> {
    let mut fields = Vec::new();
    let mut i = 0;
    while i < record.len() {
        if record[i] != '<' {
            i += 1;
            continue;
        }
        // `<名前:長さ[:型]>` を読む
        let Some(close) = record[i..].iter().position(|&c| c == '>').map(|p| i + p) else {
            break;
        };
        let header: String = record[i + 1..close].iter().collect();
        let mut parts = header.split(':');
        let (name, len) = (
            parts.next(),
            parts.next().and_then(|l| l.parse::<usize>().ok()),
        );
        match (name, len) {
            (Some(name), Some(len)) if !name.is_empty() => {
                let start = close + 1;
                let end = (start + len).min(record.len());
                fields.push((name.to_uppercase(), record[start..end].iter().collect()));
                i = end; // 値の中の `<` は読まず、宣言された長さだけ進む
            }
            _ => i = close + 1,
        }
    }
    fields
}

/// 大文字小文字を区別せずに `<EOR>` で分ける
fn split_records(adif: &str) -> Vec<Vec<char>> {
    let chars: Vec<char> = adif.chars().collect();
    let mut records = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i + 5 <= chars.len() {
        let is_eor = chars[i..i + 5]
            .iter()
            .collect::<String>()
            .eq_ignore_ascii_case("<EOR>");
        if is_eor {
            records.push(chars[start..i].to_vec());
            i += 5;
            start = i;
        } else {
            i += 1;
        }
    }
    records.push(chars[start..].to_vec());
    records
}

/// ADIFのテキストを、FLE形式のテキストに変換する。
///
/// 日付は変わったときだけ、バンド・モードは変わったときだけ書く。
/// コールサイン・日付・時刻のないレコードは読み飛ばす。
pub fn adif_to_fle(adif: &str) -> String {
    let (mut today, mut band, mut mode) = (String::new(), String::new(), String::new());
    let mut out = String::new();

    for record in split_records(adif) {
        let fields = parse_fields(&record);
        let get = |name: &str| {
            fields
                .iter()
                .find(|(n, _)| n == name)
                .map(|(_, v)| v.trim().to_string())
                .filter(|v| !v.is_empty())
        };
        let (Some(call), Some(day), Some(time)) = (get("CALL"), get("QSO_DATE"), get("TIME_ON"))
        else {
            continue;
        };
        if day.len() < 8 || time.len() < 4 {
            continue;
        }

        if day != today {
            out.push_str(&format!(
                "date {}-{}-{}\n",
                &day[..4],
                &day[4..6],
                &day[6..8]
            ));
            today = day;
        }

        let new_band = get("BAND").map(|b| b.to_uppercase());
        let new_mode = get("MODE").map(|m| m.to_uppercase());
        let band_changed = new_band.as_ref().is_some_and(|b| *b != band);
        let mode_changed = new_mode.as_ref().is_some_and(|m| *m != mode);
        if band_changed || mode_changed {
            if let Some(b) = new_band {
                band = b;
            }
            if let Some(m) = new_mode {
                mode = m;
            }
            out.push_str(&format!("{} {}\n", band.to_lowercase(), mode));
        }

        let rst_sent = get("RST_SENT").unwrap_or_else(|| "599".to_string());
        let rst_rcvd = get("RST_RCVD").unwrap_or_else(|| "599".to_string());
        out.push_str(&format!(
            "{} {} {} {}\n",
            &time[..4],
            call.to_uppercase(),
            rst_sent,
            rst_rcvd
        ));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compile_fle;

    const COMPACT: &str = "<CALL:6>JA1XYZ<QSO_DATE:8>20241228<TIME_ON:4>1234<MODE:2>CW<BAND:3>40m<RST_SENT:3>599<RST_RCVD:3>579<EOR><CALL:6>JA1QSO<QSO_DATE:8>20241228<TIME_ON:4>1240<MODE:2>CW<BAND:3>40m<EOR>";

    fn lines(s: &str) -> Vec<&str> {
        s.lines().collect()
    }

    #[test]
    fn date_and_band_mode_are_written_only_when_they_change() {
        assert_eq!(
            lines(&adif_to_fle(COMPACT)),
            vec![
                "date 2024-12-28",
                "40m CW",
                "1234 JA1XYZ 599 579",
                "1240 JA1QSO 599 599"
            ]
        );
    }

    #[test]
    fn fields_without_separators_and_the_last_field_of_a_record_are_read() {
        // 区切りの空白がなくても、レコード末尾の RST_RCVD でも、宣言された長さで読める
        assert!(adif_to_fle(COMPACT).contains("1234 JA1XYZ 599 579"));
    }

    #[test]
    fn ordinary_adif_with_spaces_and_newlines_is_read() {
        let spaced =
            "<CALL:6>JA1XYZ <QSO_DATE:8>20241228 <TIME_ON:6>123456 <MODE:3>SSB <BAND:3>20m <EOR>\n";
        assert_eq!(
            lines(&adif_to_fle(spaced)),
            vec!["date 2024-12-28", "20m SSB", "1234 JA1XYZ 599 599"]
        );
    }

    #[test]
    fn a_value_containing_angle_brackets_is_skipped_by_its_declared_length() {
        let rec = "<COMMENT:5>a<b>c<CALL:6>JA1XYZ<QSO_DATE:8>20241228<TIME_ON:4>0900<MODE:2>CW<BAND:3>40m<EOR>";
        assert!(adif_to_fle(rec).contains("0900 JA1XYZ"));
    }

    #[test]
    fn records_missing_call_date_or_time_are_skipped() {
        assert_eq!(adif_to_fle("<QSO_DATE:8>20241228<TIME_ON:4>1234<EOR>"), "");
        assert_eq!(adif_to_fle("<CALL:6>JA1XYZ<TIME_ON:4>1234<EOR>"), "");
        assert_eq!(adif_to_fle(""), "");
    }

    #[test]
    fn eor_is_case_insensitive_and_calls_are_upper_cased() {
        let rec = "<call:6>ja1xyz<qso_date:8>20241228<time_on:4>0900<mode:2>cw<band:3>40m<eor>";
        assert_eq!(
            lines(&adif_to_fle(rec)),
            vec!["date 2024-12-28", "40m CW", "0900 JA1XYZ 599 599"]
        );
    }

    #[test]
    fn a_new_date_is_written_when_the_day_changes() {
        let rec = "<CALL:6>JA1XYZ<QSO_DATE:8>20241228<TIME_ON:4>2359<MODE:2>CW<BAND:3>40m<EOR><CALL:6>JA1QSO<QSO_DATE:8>20241229<TIME_ON:4>0001<MODE:2>CW<BAND:3>40m<EOR>";
        assert_eq!(
            lines(&adif_to_fle(rec)),
            vec![
                "date 2024-12-28",
                "40m CW",
                "2359 JA1XYZ 599 599",
                "date 2024-12-29",
                "0001 JA1QSO 599 599"
            ]
        );
    }

    #[test]
    fn japanese_text_in_other_fields_does_not_shift_the_reading() {
        let rec = "<NAME:4>山田太郎<CALL:6>JA1XYZ<QSO_DATE:8>20241228<TIME_ON:4>0900<MODE:2>CW<BAND:3>40m<EOR>";
        assert!(adif_to_fle(rec).contains("0900 JA1XYZ"));
    }

    #[test]
    fn the_converted_text_is_valid_fle() {
        // 変換した結果を、そのまま FLE として解釈できる(誤りがなく、QSOの数が合う)
        let fle = format!("mycall JA1ABC\n{}", adif_to_fle(COMPACT));
        let compiled = compile_fle(&fle);
        assert_eq!(compiled.status, "OK", "{fle:?} -> {:?}", compiled.errors);
        assert_eq!(compiled.records.len(), 2);
    }
}
