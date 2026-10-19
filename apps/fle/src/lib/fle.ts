import type { Edit } from './edits'
import init, {
  compile as wasmCompile,
  adifToFle as wasmAdifToFle,
  checkOutput as wasmCheckOutput,
  complete as wasmComplete,
  sampleLog as wasmSampleLog,
  fill as wasmFill,
  gridLocator as wasmGridLocator,
  stationAt as wasmStationAt,
  lineInfo as wasmLineInfo,
  stationPlan as wasmStationPlan,
  generateZip as wasmGenerateZip,
} from '../wasm/fle/fle'

/** 1QSO分。省略された時刻・バンド・モード・RSTは前の行から補完済み。 */
export interface QsoView {
  /** 元のテキストでの行番号(0始まり) */
  line: number
  date: string
  /** UTCでの時刻(HH:MM) */
  time: string
  /** このQSOのタイムゾーン(UTCからの時間差。UTC は 0) */
  tz: number
  /** ログに書かれている形(そのタイムゾーンでの時刻) */
  localTime: string
  call: string
  band: string
  mode: string
  freq: string
  rstSent: string
  rstRcvd: string
  refs: string[]
  /** 相手局のグリッドロケータ(QSOの行に書いたもの)。なければ空 */
  grid: string
  comment: string
}

export interface ErrorView {
  /** 元のテキストでの行番号(0始まり) */
  line: number
  message: string
  /** 誤りの種類。言語ごとの文面を選ぶ鍵 */
  code: string
  /** 文面に入れる値 */
  args: string[]
  /** 誤りの範囲(テキスト全体での、UTF-16の文字位置) */
  from: number
  to: number
}

/** fle-core の `compile_log` が返す、行番号つきの表示用データ */
export interface LogView {
  status: 'OK' | 'ERR'
  mycall: string
  operator: string
  mysota: string
  mywwff: string
  mypota: string[]
  qsos: QsoView[]
  errors: ErrorView[]
}

/** 補完の結果。候補と、確定するときに置き換える範囲の開始位置は、どちらもコアが決める。 */
export interface Completion {
  /** 置き換えの開始位置(UTF-16)。終わりはカーソル */
  from: number
  candidates: Candidate[]
}

/** 補完候補。文法上ありえるキーワードで、並べ方もコアが決める。 */
export interface Candidate {
  text: string
  /** `rig` は、文法でなく、個人の設定の一覧から画面が出す */
  kind: 'command' | 'band' | 'mode' | 'day' | 'timezone' | 'rig'
}

/** 時間帯の短い表記(+9 は JST、それ以外は UTC+N / UTC-N。UTC は空) */
export function zoneLabel(tz: number): string {
  if (tz === 0) return ''
  if (tz === 9) return 'JST'
  return `UTC${tz > 0 ? '+' : '-'}${Math.abs(tz)}`
}

/** ログに書かれている形の時刻。UTC以外のときは、時間帯を添える(例: 18:05 (JST)、20:05 (UTC+8)) */
export function timeLabel(q: Pick<QsoView, 'time' | 'tz' | 'localTime'>): string {
  if (q.tz === 0) return q.time
  return `${q.localTime} (${zoneLabel(q.tz)})`
}

/** 自局のコールサインと、いまの運用場所。すべて任意(空なら指定なし) */
export interface Station {
  mycall: string
  sota: string
  /** 同じ場所にある公園のすべて */
  pota: string[]
  wwff: string
  grid: string
}

export interface FieldError {
  field: 'mycall' | 'sota' | 'pota' | 'wwff' | 'grid'
  message: string
}

/** ログに書き込む修正と、入力の誤り(誤りがあるときは、修正は空) */
export interface StationPlan {
  edits: Edit[]
  errors: FieldError[]
}

/** 出力する前に知らせる、ログの不足。文面は画面が作る(コードで区別する) */
export interface OutputWarning {
  code: 'missing_date' | 'missing_mycall' | 'missing_place' | 'missing_grid'
  /** 入力する項目 */
  field: 'date' | 'mycall' | 'place' | 'grid'
  /** required: ないと出力が不完全。recommended: あったほうがよい */
  severity: 'required' | 'recommended'
  /** 影響を受けるQSOの数 */
  qsos: number
}

let ready: Promise<unknown> | null = null
let initialized = false

/** WASMの初期化は最初の呼び出し時に一度だけ行う */
export function ensureReady() {
  ready ??= init().then(() => {
    initialized = true
  })
  return ready
}

export async function compileLog(text: string): Promise<LogView> {
  await ensureReady()
  return wasmCompile(text) as LogView
}

/** カーソルより前のテキストから、次に入力できるキーワードを返す。 */
export async function completeAt(textBeforeCaret: string): Promise<Completion> {
  await ensureReady()
  return wasmComplete(textBeforeCaret) as Completion
}

/** ADIFのテキストを、FLE形式のテキストに変換する(ログの追記用)。 */
export async function adifToFle(adif: string): Promise<string> {
  await ensureReady()
  return wasmAdifToFle(adif)
}

/** 書き方の見本になるFLEログ。`date` は `YYYY-MM-DD`。 */
export async function sampleLog(date: string): Promise<string> {
  await ensureReady()
  return wasmSampleLog(date)
}

/** 時刻の挿入に加えて、何を確定するか(すべて省略可。省略は偽) */
export interface FillOptions {
  /** 時刻のない行に、いまの時刻を入れない(紙ログの打ち込み)。その行は前の時刻を引き継ぐ */
  noClock?: boolean
  /** 省略形の時刻(15 など)を HHMM に展開する */
  expandTime?: boolean
  /** 省略されたバンド・モードを書く */
  bandMode?: boolean
  /** 省略された RST を書き、省略形(4 など)を解決した値に置き換える */
  rst?: boolean
}

/**
 * その行の補完を確定する修正を返す。時刻の挿入は `noClock` でなければ常に行い、`options` で、それ以外に何を
 * 確定するかを選ぶ(Enter は指定なし、確定ボタンは設定に従う)。
 * キー入力の中で同期的に使うため、WASMの準備ができていなければ空を返す。
 */
export function fillLine(
  text: string,
  line: number,
  nowMs: number,
  defaultTz: number,
  options?: FillOptions
): Edit[] {
  if (!initialized) return []
  return wasmFill(text, line, nowMs, defaultTz, options) as Edit[]
}

/** `line` の行の直前までで有効な、自局と運用場所(カーソルの位置で、どの場所かが変わる) */
export async function stationAt(text: string, line: number): Promise<Station> {
  await ensureReady()
  return wasmStationAt(text, line) as Station
}

/** `line` の行までを読んだ時点の状態。候補バーが、カーソルのある行の意味を出すのに使う。 */
export interface LineInfo {
  /** `blank`(空行・注釈だけの行) / `directive` / `qso`(バンド・モードだけの行を含む) */
  kind: 'blank' | 'directive' | 'qso'
  /** 指令の行なら、そのキーワード(小文字)。ほかは空 */
  directive: string
  /** 基準日付(`YYYY-MM-DD`、ログのタイムゾーンでの日付)。`date` がまだなければ空 */
  date: string
  /** 基準日付の曜日(月曜が 1、日曜が 7)。日付がなければ 0 */
  weekday: number
  /** `timezone` の指定(UTCからの時間差)。指定がなければ null */
  timezone: number | null
  /** この時点の時刻(`HH:MM`、ログのタイムゾーンで)。時刻のない次の行は、これを引き継ぐ */
  time: string
  band: string
  mode: string
  /** `rig -` のあとや指定がなければ空 */
  rig: string
  sota: string
  pota: string[]
  wwff: string
  /** 変数を置き換えたQSLメッセージ */
  qslmsg: string
  qslmsg2: string
  /** この時点で数える日(UTC、`YYYY-MM-DD`)。この日のQSOの数を出す */
  qsoDate: string
}

export async function lineInfo(text: string, line: number): Promise<LineInfo> {
  await ensureReady()
  return wasmLineInfo(text, line) as LineInfo
}

/** 自局と運用場所を、ログに書き込む修正にする。`line` の行の前に、指令の行が入る。 */
export async function stationPlan(text: string, line: number, want: Station): Promise<StationPlan> {
  await ensureReady()
  return wasmStationPlan(text, line, want) as StationPlan
}

/** 緯度・経度から、グリッドロケータ(6文字)を求める。範囲外なら undefined */
export async function gridLocator(lat: number, lon: number): Promise<string | undefined> {
  await ensureReady()
  return wasmGridLocator(lat, lon)
}

/** ファイルを生成する前に、足りない情報(自局のコールサイン・運用場所・グリッド)を調べる */
export async function checkOutput(text: string): Promise<OutputWarning[]> {
  await ensureReady()
  return wasmCheckOutput(text) as OutputWarning[]
}

export async function generateFleZip(text: string, now: Date = new Date()): Promise<Uint8Array> {
  await ensureReady()
  return wasmGenerateZip(text, now.getTime())
}
