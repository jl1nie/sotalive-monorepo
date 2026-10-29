/**
 * HAMLOG の QTH・Rmks1・Rmks2 の欄に書く内容。書式の中の値はコア(出力)が差し込む。
 *
 * - `{myref}`: 自局の山・公園(SOTA・WWFF・POTA)
 * - `{hisref}`: 相手局の山・公園
 * - `{memo}`: そのQSOの時点で有効なメモ(最後の `#` の行)
 * - `{rmks}`: QSO の行の備考(`{…}`)
 * - `{qslmsg}`: QSL メッセージ
 * - `{rig}`: `Rig=…`(`rig` がなければ空)
 */
/** HAMLOG の CSV の日付・時刻を書く時間帯。ログをどの時間帯で書いたかによらない(HAMLOG の記号は J と U だけ) */
export type HamlogZone = 'jst' | 'utc'

export interface HamlogColumns {
  qth: string
  rmks1: string
  rmks2: string
}

/** 既定は、旧 HamLogConv と同じ出力 */
export const DEFAULT_HAMLOG_COLUMNS: HamlogColumns = {
  qth: '{rmks} {hisref}',
  rmks1: '{myref}',
  rmks2: '%{qslmsg}%{rig}',
}

/** 差し込める値(設定画面で、押すと欄に入るボタンにする) */
export const HAMLOG_FIELDS = ['{myref}', '{hisref}', '{memo}', '{rmks}', '{qslmsg}', '{rig}'] as const

/**
 * 設定画面で選ぶ項目。欄に書く内容は、この並びで空白でつなぐ(QSL メッセージと Rig はつなげて書く)。
 * 保存・同期は書式の文字列のまま(古い版の端末とも同期する)。画面は、書式からこの項目の組を読み、
 * 組から書式を作る。この並びで作れない書式は、画面では「自由な書式」として、その欄だけ文字で見せる
 */
export const HAMLOG_ITEMS = [
  { item: 'rmks', tag: '{rmks}' },
  { item: 'hisref', tag: '{hisref}' },
  { item: 'myref', tag: '{myref}' },
  { item: 'memo', tag: '{memo}' },
  // QSL メッセージは `%…%` で囲む(空なら、囲みごと消える)
  { item: 'qsl', tag: '%{qslmsg}%' },
  { item: 'rig', tag: '{rig}' },
] as const

export type HamlogItem = (typeof HAMLOG_ITEMS)[number]['item']

/** 選んだ項目から書式を作る。並びは `HAMLOG_ITEMS` の順 */
export function buildTemplate(selected: readonly HamlogItem[]): string {
  let out = ''
  let prev: HamlogItem | null = null
  for (const { item, tag } of HAMLOG_ITEMS) {
    if (!selected.includes(item)) continue
    // Rig は QSL メッセージのすぐ後ろに、空白なしで続ける(`%…%Rig=…`)
    out += prev === null ? tag : prev === 'qsl' && item === 'rig' ? tag : ` ${tag}`
    prev = item
  }
  return out
}

/** 書式から、選ばれている項目を読む。`buildTemplate` で作れない書式は null(自由な書式) */
export function parseTemplate(template: string): HamlogItem[] | null {
  for (let mask = 0; mask < 1 << HAMLOG_ITEMS.length; mask++) {
    const selected = HAMLOG_ITEMS.filter((_, i) => mask & (1 << i)).map((x) => x.item)
    if (buildTemplate(selected) === template) return selected
  }
  return null
}

export type HamlogPresetId = 'classic' | 'memoRmks1'

/** よく使う組み合わせ。classic は既定(旧 HamLogConv と同じ) */
export const HAMLOG_PRESETS: { id: HamlogPresetId; columns: HamlogColumns }[] = [
  { id: 'classic', columns: DEFAULT_HAMLOG_COLUMNS },
  // メモ(JCC・JCG など)を Rmks1 に、運用先を Rmks2 に(QSL メッセージと Rig はその後ろ)
  { id: 'memoRmks1', columns: { qth: '{rmks} {hisref}', rmks1: '{memo}', rmks2: '{myref} %{qslmsg}%{rig}' } },
]

/** いまの欄がどのプリセットと同じか。どれでもなければ null */
export function matchPreset(value: HamlogColumns): HamlogPresetId | null {
  return (
    HAMLOG_PRESETS.find(({ columns }) => columns.qth === value.qth && columns.rmks1 === value.rmks1 && columns.rmks2 === value.rmks2)
      ?.id ?? null
  )
}
