/** 書き方の見本になるFLEログ(日付は今日)。 */
export function generateSample(): string {
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`

  return `#Header
mycall jl1nie/0
operator jl1nie
mywwff jaff-0218
mypota jp-1151 jp-1164
mysota ja/st-012
qslmsg $sat丸山$mysota $mypota $rig
#Log
timezone +0
date ${dateStr}
rigset 1
40m cw
2302 ja1qsa
4 ja4qru 6 7 <曽田さん>{島根市}
4 ja8qsw 4 {札幌市}
ssb
14 ja4qsy
40 jq1qso/1 5 3 jaff-0218 ja-1151 ja-1164
70cm fm
55 jg0qro/0 ja/nn-001 {松本市 AO-91/FM/144MHz}
58 jk2qsu {PM85rl AO-91/FM/144MHz}
day +
17m cw
rigset 0
04 zl1qsb 41 31
20m ft4
45 zl1qrz -18 -19
rigset 2
50.550 am
0130 jj1qth 3 4`
}
