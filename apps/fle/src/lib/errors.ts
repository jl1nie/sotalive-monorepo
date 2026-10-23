import type { ErrorView } from '@/lib/fle'

import type { Lang } from '@/lib/i18n'

// コアは、誤りの種類(`code`)と値(`args`)を返し、文面は画面が言語設定で作る

/** 指令の値の名前(`mysota` なら「SOTAの参照番号」) */
const OPERAND_JA: Record<string, string> = {
  mycall: 'コールサイン',
  operator: '運用者のコールサイン',
  mysota: 'SOTAの参照番号',
  mywwff: 'WWFFの参照番号',
  mypota: 'POTAの参照番号',
  mygrid: 'グリッドロケータ',
  date: '日付',
  day: '+ か ++',
  timezone: 'タイムゾーン(例 +9 か jst)',
  rig: 'HAMLOG の Rig= の右辺(例 KX2/IC-705+EFHW)',
}

type Args = string[]
const a = (args: Args, i: number) => args[i] ?? ''

const JA: Record<string, (args: Args) => string> = {
  date_out_of_range: () => '日付が範囲外です',
  out_of_band: (x) => `周波数 ${a(x, 0)} は、バンドの範囲外です`,
  unknown_band: (x) => `周波数 ${a(x, 0)} のバンドが分かりません`,
  invalid_time: (x) => `時刻が正しくありません: ${a(x, 0)}`,
  time_overflow: (x) => `時刻が24時を超えます(${a(x, 0)})。日をまたぐときは day + を書きます`,
  duplicate_callsign: (x) => `1行に書けるコールサインは1つです: ${a(x, 0)}`,
  missing_band: () => 'バンドか周波数を書いてください',
  missing_mode: () => 'モード(cw・ssb など)を書いてください',
  renamed_directive: (x) => `${a(x, 0)} は ${a(x, 1)} に変わりました。HAMLOG の Rig= の右辺を書きます(例: rig KX2/IC-705+EFHW)`,
  unknown_word: (x) => `意味の分からない語です: ${a(x, 0)}`,
  unexpected_keyword: (x) => `この位置に置けないキーワードです: ${a(x, 0)}`,
  unexpected_word: (x) => `この位置に置けない語です: ${a(x, 0)}`,
  missing_callsign: () => 'QSOの行には、コールサインが必要です',
  missing_association: (x) => `山のアソシエーションを書いてください(例: JA/${a(x, 0)})。アソシエーションを省けるのは、自分の山(mysota)があるときだけです`,
  unclosed_comment: () => '括弧が閉じていません',
  missing_operand: (x) => `${a(x, 0)} の値(${OPERAND_JA[a(x, 0)] ?? '値'})がありません`,
  invalid_operand: (x) => `${a(x, 0)} の値が正しくありません: ${a(x, 1)}`,
  unknown_operand: (x) => `${a(x, 0)} の値が分かりません: ${a(x, 1)}`,
  extra_operand: (x) => `${a(x, 0)} に余分な値があります: ${a(x, 1)}`,
}

/** 英語は、コアの文面(`message`)を使う。文面の誤りを直せないもの(旧実装との照合で固定)だけ、ここで上書きする */
const EN: Record<string, (args: Args) => string> = {
  duplicate_callsign: (x) => `Each line must contain only one callsign: ${a(x, 0)}`,
}

export function errorText(e: ErrorView, lang: Lang): string {
  if (lang === 'ja') {
    const make = JA[e.code]
    if (make) return make(e.args)
  }
  return EN[e.code]?.(e.args) ?? e.message
}
