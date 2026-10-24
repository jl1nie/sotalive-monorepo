/**
 * HAMLOG の QTH・Rmks1・Rmks2 の欄に書く内容。書式の中の値はコア(出力)が差し込む。
 *
 * - `{myref}`: 自局のリファレンス(SOTA・WWFF・POTA)
 * - `{hisref}`: 相手局のリファレンス
 * - `{memo}`: そのQSOの時点で有効なメモ(最後の `#` の行)
 * - `{rmks}`: QSO の行の備考(`{…}`)
 * - `{qslmsg}`: QSL メッセージ
 * - `{rig}`: `Rig=…`(`rig` がなければ空)
 */
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
