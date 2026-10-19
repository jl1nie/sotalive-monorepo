//! ある行の時点の状態と、その行の種類。画面の候補バーが、カーソルのある行の意味を出すのに使う。
//!
//! 日付・バンド・モードなどの引き継ぎを知っているのはコアだけ。画面は、ここで解決した値を並べるだけにする
//! (`day +` の先の日付、`$mysota` を置き換えたQSLの文面など)。

use chrono::{Datelike, NaiveDate};
use serde::Serialize;

use crate::compiler::{expand_rig, fold};
use crate::syntax::{parse_line, LineKind};

/// `line` の行を読んだあとの状態
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineInfo {
    /// `blank`(空行・注釈だけの行) / `directive` / `qso`(バンド・モードだけの行を含む)
    pub kind: String,
    /// 指令の行なら、そのキーワード(小文字)。ほかは空
    pub directive: String,
    /// 基準日付(`YYYY-MM-DD`、ログのタイムゾーンでの日付)。`date` がまだなければ空
    pub date: String,
    /// 基準日付の曜日(月曜が 1、日曜が 7)。日付がなければ 0
    pub weekday: u8,
    /// `timezone` の指定(UTCからの時間差)。指定がなければ None
    pub timezone: Option<i32>,
    pub band: String,
    pub mode: String,
    /// HAMLOG の `Rig=` の右辺。`rig -` のあとや指定がなければ空
    pub rig: String,
    pub sota: String,
    pub pota: Vec<String>,
    pub wwff: String,
    /// 変数を置き換えたQSLメッセージ。`$rig` は、この時点の `rig` で置き換える。まだ `rig` がなければ、
    /// `$rig` のまま残す(QSOごとに置き換わる値なので、空にすると、あとの `rig` が入ることがわからない)
    pub qslmsg: String,
    pub qslmsg2: String,
    /// この時点で数える日(UTC、`YYYY-MM-DD`)。この日のQSOの数を出すのに使う。
    /// 最後のQSOのあとで日付を変えていなければ、そのQSOのUTCの日付。変えていれば、基準日付
    pub qso_date: String,
}

/// `line`(0始まり)の行までを読んだ時点の状態
pub fn line_info(text: &str, line: usize) -> LineInfo {
    let lines: Vec<&str> = text.split('\n').collect();
    let upto = lines[..(line + 1).min(lines.len())].join("\n");
    let f = fold(&upto);
    let env = &f.env;

    let raw = lines.get(line).copied().unwrap_or("");
    let (kind, directive) = match parse_line(raw.strip_suffix('\r').unwrap_or(raw)).kind {
        LineKind::Blank => ("blank", ""),
        LineKind::Directive(d) => ("directive", d.spec.key),
        LineKind::Qso(_) => ("qso", ""),
    };

    let base = env
        .date_set
        .then(|| NaiveDate::from_ymd_opt(env.year.into(), env.month.into(), env.day.into()))
        .flatten();
    let ymd = |d: NaiveDate| d.format("%Y-%m-%d").to_string();
    let qso_date = match f.records.last() {
        Some(q) if !f.date_moved && !q.date_unset => {
            format!("{:04}-{:02}-{:02}", q.year, q.month, q.day)
        }
        _ => base.map(ymd).unwrap_or_default(),
    };

    LineInfo {
        kind: kind.to_string(),
        directive: directive.to_string(),
        date: base.map(ymd).unwrap_or_default(),
        weekday: base.map_or(0, |d| d.weekday().number_from_monday() as u8),
        timezone: env.timezone,
        band: env.current.band.clone(),
        mode: env.current.mode.clone(),
        rig: env.rig.clone(),
        sota: env.mysota.clone(),
        pota: env.mypota.clone(),
        wwff: env.mywwff.clone(),
        qslmsg: if env.rig.is_empty() {
            env.qslmsg.clone()
        } else {
            expand_rig(&env.qslmsg, &env.rig)
        },
        qslmsg2: env.qslmsg2.clone(),
        qso_date,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOG: &str = "mycall JA1ABC
# 注釈
mysota ja/st-012
mypota jp-1151 jp-1164
date 2026-10-19
rig KX2
qslmsg TNX $mysota $rig
40m cw
2302 ja1qsa
day +
17m cw
rig -
0004 zl1qsb";

    fn at(s: &str) -> LineInfo {
        let line = LOG.split('\n').position(|l| l == s).expect("line in LOG");
        line_info(LOG, line)
    }

    #[test]
    fn the_kind_of_the_line() {
        assert_eq!(
            (at("# 注釈").kind.as_str(), at("# 注釈").directive.as_str()),
            ("blank", "")
        );
        assert_eq!(at("day +").directive, "day");
        assert_eq!(at("40m cw").kind, "qso");
        assert_eq!(at("2302 ja1qsa").kind, "qso");
        assert_eq!(line_info(LOG, 99).kind, "blank");
    }

    #[test]
    fn the_date_moves_with_day() {
        let date = at("date 2026-10-19");
        assert_eq!((date.date.as_str(), date.weekday), ("2026-10-19", 1));
        let next = at("day +");
        assert_eq!((next.date.as_str(), next.weekday), ("2026-10-20", 2));
        assert_eq!(at("# 注釈").date, "", "date がまだない");
    }

    #[test]
    fn band_and_mode_follow_the_lines_not_the_last_qso() {
        let l = at("17m cw");
        assert_eq!((l.band.as_str(), l.mode.as_str()), ("17m", "CW"));
    }

    #[test]
    fn qslmsg_is_expanded_with_the_rig_of_that_point() {
        assert_eq!(at("qslmsg TNX $mysota $rig").qslmsg, "TNX JA/ST-012 KX2");
        assert_eq!(at("rig -").rig, "");
        assert_eq!(
            at("rig -").qslmsg,
            "TNX JA/ST-012 $rig",
            "rig がなければ $rig のまま"
        );
        let before_rig = line_info("mysota ja/st-012\nqslmsg TNX $rig", 1);
        assert_eq!(before_rig.qslmsg, "TNX $rig");
    }

    #[test]
    fn places_are_as_written_so_far() {
        let l = at("mypota jp-1151 jp-1164");
        assert_eq!(
            (l.sota.as_str(), l.pota.clone()),
            (
                "JA/ST-012",
                vec!["JP-1151".to_string(), "JP-1164".to_string()]
            )
        );
    }

    #[test]
    fn the_day_to_count_is_the_last_qso_unless_the_date_moved() {
        assert_eq!(at("2302 ja1qsa").qso_date, "2026-10-19");
        // day + のあと、まだQSOがない
        assert_eq!(at("17m cw").qso_date, "2026-10-20");
        assert_eq!(at("0004 zl1qsb").qso_date, "2026-10-20");
    }

    #[test]
    fn the_day_to_count_is_in_utc() {
        let log = "mycall JA1ABC\ntimezone +9\ndate 2026-10-19\n40m cw\n0800 ja1qsa\n";
        // 08:00 JST は、前の日の 23:00 UTC
        assert_eq!(line_info(log, 5).qso_date, "2026-10-18");
        assert_eq!(line_info(log, 5).timezone, Some(9));
    }
}
