//! ログの時間帯(`timezone`)の付け替え。設定のタイムゾーンを変えたときに使う。
//!
//! 1つのログは1つの時間帯で書く。`timezone` の行は、最初の QSO より前に1つだけにする
//! (ログの途中の `timezone` 行は消す。UTC なら、行を置かない)。
//!
//! - 変換する(`convert`): QSO の時刻を、新しい時間帯で書き直す。0 時をまたぐときは `date` の行も直す・足す。
//!   どの QSO も、UTC の瞬間は変わらない(出力は同じになる)。
//! - 変換しない: `timezone` の行だけを書き換える。書いてある時刻は、新しい時間帯の時刻として読まれる
//!   (JST で書いた紙ログに、`timezone` を書き忘れていたとき)。

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, Timelike};

use crate::compiler::{compile_fle, fold};
use crate::syntax::{parse_line, DateValue, DirValue, LineKind, QsoItem};

/// ログの時間帯を `tz`(UTCからの時間差)にしたテキスト。変わらなければ、同じテキストを返す。
pub fn retime(text: &str, tz: i32, convert: bool) -> String {
    let lines: Vec<String> = text.split('\n').map(str::to_string).collect();
    let lines = if convert {
        convert_times(&lines, tz)
    } else {
        lines
    };
    set_timezone_line(lines, tz).join("\n")
}

/// `timezone` の行を、最初の QSO より前の1つにする(UTC なら置かない)
fn set_timezone_line(lines: Vec<String>, tz: i32) -> Vec<String> {
    let first_qso = lines
        .iter()
        .position(|l| matches!(parse_line(body(l)).kind, LineKind::Qso(_)));
    let mut out = Vec::with_capacity(lines.len() + 1);
    let mut placed = tz == 0;
    for (i, line) in lines.into_iter().enumerate() {
        if !is_timezone_line(&line) {
            out.push(line);
            continue;
        }
        // QSO より前の、最初の timezone 行は、その場所で書き直す。ほかは消す
        if !placed && first_qso.map_or(true, |q| i < q) {
            let cr = if line.ends_with('\r') { "\r" } else { "" };
            out.push(format!("{}{cr}", timezone_line(tz)));
            placed = true;
        }
    }
    if !placed {
        out.insert(0, timezone_line(tz));
    }
    out
}

fn timezone_line(tz: i32) -> String {
    format!("timezone {tz:+}")
}

fn is_timezone_line(line: &str) -> bool {
    matches!(
        parse_line(body(line)).kind,
        LineKind::Directive(d) if matches!(d.value, Some(DirValue::Timezone(_)))
    )
}

/// 行の `\r` を除いた本体
fn body(line: &str) -> &str {
    line.strip_suffix('\r').unwrap_or(line)
}

/// その行で決まる瞬間(UTC)と、日付が `date` で決まっているか
#[derive(Clone, Copy)]
struct Instant {
    utc: NaiveDateTime,
    dated: bool,
}

/// QSO の時刻を `tz` の時刻に書き直し、0 時をまたぐところの `date` を合わせる
fn convert_times(lines: &[String], tz: i32) -> Vec<String> {
    let text = lines.join("\n");
    let records = compile_fle(&text).records;
    let offset = Duration::hours(i64::from(tz));

    // 時刻が決まる行(QSO と、時刻を書いた設定の行)の、UTC の瞬間
    let instants: Vec<Option<Instant>> = lines
        .iter()
        .enumerate()
        .map(|(i, line)| {
            let LineKind::Qso(items) = parse_line(body(line)).kind else {
                return None;
            };
            if let Some(r) = records.iter().find(|r| r.line == i) {
                let utc = NaiveDate::from_ymd_opt(r.year.into(), r.month.into(), r.day.into())?
                    .and_hms_opt(r.hour.into(), r.min.into(), 0)?;
                return Some(Instant {
                    utc,
                    dated: !r.date_unset,
                });
            }
            // コールサインのない行でも、時刻を書けば、あとの行が引き継ぐ
            if items
                .iter()
                .any(|it| matches!(it.node, QsoItem::Time { .. }))
            {
                let env = fold(&lines[..=i].join("\n")).env;
                return Some(Instant {
                    utc: env.to_utc(),
                    dated: env.date_set,
                });
            }
            None
        })
        .collect();

    let mut out: Vec<String> = Vec::with_capacity(lines.len());
    // 書き直したテキストでの、いまの日付と時刻
    let mut date: Option<NaiveDate> = None;
    let mut hm = (0, 0);
    for (i, line) in lines.iter().enumerate() {
        let ast = parse_line(body(line));
        match &ast.kind {
            LineKind::Directive(d) => {
                let Some(value @ (DirValue::Date(_) | DirValue::Day(_))) = &d.value else {
                    out.push(line.clone());
                    continue;
                };
                let applied = apply_date(value, date);
                // この日付で書く、次の QSO の日付(次の date / day まで)
                let next = (i + 1..lines.len())
                    .take_while(|&j| !is_date_line(&lines[j]))
                    .find_map(|j| instants[j]);
                let want = match next {
                    Some(n) if n.dated => Some((n.utc + offset).date()),
                    _ => applied,
                };
                if want != applied {
                    let want = want.expect("next instant has a date");
                    let from = d.key_span.0;
                    let to = d.arg_spans.last().map_or(d.key_span.1, |s| s.1);
                    out.push(replace_utf16(line, from, to, &date_text(want)));
                } else {
                    out.push(line.clone());
                }
                date = want;
                hm = (0, 0);
            }
            LineKind::Qso(items) => {
                let Some(at) = instants[i] else {
                    out.push(line.clone());
                    continue;
                };
                let local = at.utc + offset;
                if at.dated && date != Some(local.date()) {
                    out.push(date_text(local.date()));
                    date = Some(local.date());
                    hm = (0, 0);
                }
                let want = (local.hour(), local.minute());
                let hhmm = format!("{:02}{:02}", want.0, want.1);
                let time = items
                    .iter()
                    .find(|it| matches!(it.node, QsoItem::Time { .. }));
                out.push(match time {
                    Some(t) if utf16_slice(line, t.span) != hhmm => {
                        replace_utf16(line, t.span.0, t.span.1, &hhmm)
                    }
                    Some(_) => line.clone(),
                    // 時刻のない行は前の時刻を引き継ぐ。引き継ぐ時刻が変わるときだけ書く
                    None if want != hm => {
                        let at = utf16_len(&line[..line.len() - line.trim_start().len()]);
                        replace_utf16(line, at, at, &format!("{hhmm} "))
                    }
                    None => line.clone(),
                });
                hm = want;
            }
            LineKind::Blank => out.push(line.clone()),
        }
    }
    out
}

fn is_date_line(line: &str) -> bool {
    matches!(
        parse_line(body(line)).kind,
        LineKind::Directive(d) if matches!(d.value, Some(DirValue::Date(_) | DirValue::Day(_)))
    )
}

/// `date` / `day` の行を、いまの日付 `date` のあとに読んだときの日付
fn apply_date(value: &DirValue, date: Option<NaiveDate>) -> Option<NaiveDate> {
    match value {
        DirValue::Date(DateValue::Ymd { year, month, day }) => {
            NaiveDate::from_ymd_opt(*year as i32, *month, *day)
        }
        DirValue::Date(DateValue::Md { month, day }) => {
            NaiveDate::from_ymd_opt(date?.year(), *month, *day)
        }
        DirValue::Day(days) => Some(date? + Duration::days(*days)),
        _ => date,
    }
}

fn date_text(date: NaiveDate) -> String {
    format!("date {}", date.format("%Y-%m-%d"))
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// UTF-16 の位置を、バイトの位置にする
fn byte_at(s: &str, utf16: usize) -> usize {
    let mut n = 0;
    for (b, c) in s.char_indices() {
        if n >= utf16 {
            return b;
        }
        n += c.len_utf16();
    }
    s.len()
}

fn utf16_slice(s: &str, (from, to): (usize, usize)) -> &str {
    &s[byte_at(s, from)..byte_at(s, to)]
}

fn replace_utf16(s: &str, from: usize, to: usize, with: &str) -> String {
    let (a, b) = (byte_at(s, from), byte_at(s, to));
    format!("{}{with}{}", &s[..a], &s[b..])
}

#[cfg(test)]
mod tests {
    use super::*;

    /// QSO ごとの UTC の日時
    fn utc_of(text: &str) -> Vec<String> {
        compile_fle(text)
            .records
            .iter()
            .map(|r| {
                format!(
                    "{:04}-{:02}-{:02} {:02}{:02} {}",
                    r.year, r.month, r.day, r.hour, r.min, r.callsign
                )
            })
            .collect()
    }

    #[test]
    fn converts_utc_times_to_jst_and_writes_the_timezone_line() {
        let text = "mycall JA1ABC\ndate 2026-10-19\n40m cw\n0905 ja1aaa\n10 ja1bbb";
        let after = retime(text, 9, true);
        assert_eq!(
            after,
            "timezone +9\nmycall JA1ABC\ndate 2026-10-19\n40m cw\n1805 ja1aaa\n1810 ja1bbb"
        );
        assert_eq!(utc_of(&after), utc_of(text));
    }

    #[test]
    fn keeps_times_and_only_relabels_when_not_converting() {
        let text = "mycall JA1ABC\ndate 2026-10-19\n40m cw\n1805 ja1aaa";
        assert_eq!(
            retime(text, 9, false),
            "timezone +9\nmycall JA1ABC\ndate 2026-10-19\n40m cw\n1805 ja1aaa"
        );
    }

    #[test]
    fn rewrites_the_existing_line_in_place_and_removes_it_for_utc() {
        let text = "mycall JA1ABC\ntimezone jst\ndate 2026-10-19\n40m cw\n1805 ja1aaa";
        assert_eq!(
            retime(text, 0, true),
            "mycall JA1ABC\ndate 2026-10-19\n40m cw\n0905 ja1aaa"
        );
        assert_eq!(
            retime(text, -5, false),
            "mycall JA1ABC\ntimezone -5\ndate 2026-10-19\n40m cw\n1805 ja1aaa"
        );
    }

    #[test]
    fn moves_the_date_when_the_times_cross_midnight() {
        // UTC 10/18 14:50 と 15:10 は、JST では 23:50 と 翌 00:10
        let text = "date 2026-10-18\n40m cw\n1450 ja1aaa\n1510 ja1bbb";
        let after = retime(text, 9, true);
        assert_eq!(
            after,
            "timezone +9\ndate 2026-10-18\n40m cw\n2350 ja1aaa\ndate 2026-10-19\n0010 ja1bbb"
        );
        assert_eq!(utc_of(&after), utc_of(text));
    }

    #[test]
    fn rewrites_the_date_line_when_the_first_qso_falls_on_another_day() {
        // JST 10/19 00:30 は、UTC では 10/18 15:30
        let text = "timezone jst\ndate 2026-10-19\n40m cw\n0030 ja1aaa";
        let after = retime(text, 0, true);
        assert_eq!(after, "date 2026-10-18\n40m cw\n1530 ja1aaa");
        assert_eq!(utc_of(&after), utc_of(text));
    }

    #[test]
    fn a_day_line_becomes_a_date_when_its_meaning_changes() {
        let text = "timezone jst\ndate 2026-10-18\n40m cw\n2300 ja1aaa\nday +\n0030 ja1bbb";
        let after = retime(text, 0, true);
        // UTC では、どちらも 10/18(14:00 と 15:30)
        assert_eq!(
            after,
            "date 2026-10-18\n40m cw\n1400 ja1aaa\ndate 2026-10-18\n1530 ja1bbb"
        );
        assert_eq!(utc_of(&after), utc_of(text));
    }

    #[test]
    fn a_zone_change_in_the_middle_becomes_one_zone() {
        let text = "date 2026-10-19\n40m cw\n0905 ja1aaa\ntimezone jst\n1810 ja1bbb";
        let after = retime(text, 9, true);
        assert_eq!(
            after,
            "timezone +9\ndate 2026-10-19\n40m cw\n1805 ja1aaa\n1810 ja1bbb"
        );
        assert_eq!(utc_of(&after), utc_of(text));
    }

    #[test]
    fn a_time_on_a_band_line_is_converted_for_the_lines_that_inherit_it() {
        let text = "date 2026-10-19\n0905 40m cw\nja1aaa";
        let after = retime(text, 9, true);
        assert_eq!(after, "timezone +9\ndate 2026-10-19\n1805 40m cw\nja1aaa");
        assert_eq!(utc_of(&after), utc_of(text));
    }

    #[test]
    fn a_log_without_a_date_converts_only_the_times() {
        let text = "40m cw\n2350 ja1aaa\n0010 ja1bbb";
        assert_eq!(
            retime(text, 9, true),
            "timezone +9\n40m cw\n0850 ja1aaa\n0910 ja1bbb"
        );
    }

    #[test]
    fn keeps_comments_crlf_and_untouched_lines() {
        let text = "date 2026-10-19\r\n40m cw\r\n0905 ja1aaa 599 599 # 山頂\r\n";
        assert_eq!(
            retime(text, 9, true),
            "timezone +9\ndate 2026-10-19\r\n40m cw\r\n1805 ja1aaa 599 599 # 山頂\r\n"
        );
    }

    #[test]
    fn the_sample_log_keeps_every_qso_through_any_zone_and_back() {
        let text = crate::sample_log("2026-10-18");
        for tz in [9, -5, 14, -12, 0] {
            let once = retime(&text, tz, true);
            assert_eq!(utc_of(&once), utc_of(&text), "tz {tz}");
            assert!(compile_fle(&once).errors.is_empty(), "tz {tz}: {once}");
            // 同じ時間帯にもう一度は、何も変えない
            assert_eq!(retime(&once, tz, true), once, "tz {tz}");
        }
    }

    #[test]
    fn nothing_changes_when_the_zone_is_already_the_same() {
        let text = "timezone +9\ndate 2026-10-19\n40m cw\n1805 ja1aaa";
        assert_eq!(retime(text, 9, true), text);
        assert_eq!(retime("", 0, true), "");
    }

    #[test]
    fn a_zone_change_in_the_middle_that_crosses_midnight() {
        // UTC 10/18 23:30 のあと、JST で 08:45(= UTC 10/18 23:45)
        let text = "date 2026-10-18\n40m cw\n2330 ja1aaa\ntimezone jst\n0845 ja1bbb";
        for tz in [9, 0, -5] {
            let after = retime(text, tz, true);
            assert_eq!(utc_of(&after), utc_of(text), "tz {tz}: {after}");
            assert!(compile_fle(&after).errors.is_empty(), "tz {tz}: {after}");
        }
        assert_eq!(
            retime(text, 9, true),
            "timezone +9\ndate 2026-10-19\n40m cw\n0830 ja1aaa\n0845 ja1bbb"
        );
        assert_eq!(
            retime(text, 0, true),
            "date 2026-10-18\n40m cw\n2330 ja1aaa\n2345 ja1bbb"
        );
    }
}
