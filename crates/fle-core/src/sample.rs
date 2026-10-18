//! 書き方の見本になる FLE ログ。
//!
//! 例文は文法と一緒に持つ(文法が変わっても、例文が有効であることをテストで保証する)。

/// 見本のログ。`date` は呼び出し側が決める(`YYYY-MM-DD`)。
pub fn sample_log(date: &str) -> String {
    format!(
        "#Header
mycall jl1nie/0
operator jl1nie
mywwff jaff-0218
mypota jp-1151 jp-1164
mysota ja/st-012
qslmsg $sat丸山$mysota $mypota $rig
#Log
timezone +0
date {date}
rigset 1
40m cw
2302 ja1qsa
4 ja4qru 6 7 <曽田さん>{{島根市}}
4 ja8qsw 4 {{札幌市}}
ssb
14 ja4qsy
40 jq1qso/1 5 3 jaff-0218 ja-1151 ja-1164
70cm fm
55 jg0qro/0 ja/nn-001 {{松本市 AO-91/FM/144MHz}}
58 jk2qsu {{PM85rl AO-91/FM/144MHz}}
day +
17m cw
rigset 0
04 zl1qsb 41 31
20m ft4
45 zl1qrz -18 -19
rigset 2
50.550 am
0130 jj1qth 3 4"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compile_fle;

    #[test]
    fn the_sample_is_valid_fle() {
        let compiled = compile_fle(&sample_log("2026-10-18"));
        assert_eq!(compiled.status, "OK", "{:?}", compiled.errors);
        assert_eq!(compiled.records.len(), 10);
    }

    #[test]
    fn the_date_is_the_one_given() {
        let sample = sample_log("2031-02-03");
        assert!(sample.contains("\ndate 2031-02-03\n"));
        let first = compile_fle(&sample).records[0].clone();
        assert_eq!((first.year, first.month, first.day), (2031, 2, 3));
    }
}
