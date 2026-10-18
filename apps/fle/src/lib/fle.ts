import type { Edit } from './edits'
import init, {
  compile as wasmCompile,
  complete as wasmComplete,
  fill as wasmFill,
  generateZip as wasmGenerateZip,
} from '../wasm/fle/fle'

/** 1QSO分。省略された時刻・バンド・モード・RSTは前の行から補完済み。 */
export interface QsoView {
  /** 元のテキストでの行番号(0始まり) */
  line: number
  date: string
  time: string
  call: string
  band: string
  mode: string
  freq: string
  rstSent: string
  rstRcvd: string
  refs: string[]
  comment: string
}

export interface ErrorView {
  /** 元のテキストでの行番号(0始まり) */
  line: number
  message: string
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

/** 補完候補。文法上ありえるキーワードで、並べ方もコアが決める。 */
export interface Candidate {
  text: string
  kind: 'command' | 'band' | 'mode' | 'day'
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
export async function completeAt(textBeforeCaret: string): Promise<Candidate[]> {
  await ensureReady()
  return wasmComplete(textBeforeCaret) as Candidate[]
}

/**
 * その行の補完を確定する修正を返す(時刻のない QSO 行の行頭に、いまの時刻を入れる)。
 * キー入力の中で同期的に使うため、WASMの準備ができていなければ空を返す。
 */
export function fillLine(text: string, line: number, nowMs: number, defaultTz: number): Edit[] {
  if (!initialized) return []
  return wasmFill(text, line, nowMs, defaultTz) as Edit[]
}

export async function generateFleZip(text: string, now: Date = new Date()): Promise<Uint8Array> {
  await ensureReady()
  return wasmGenerateZip(text, now.getTime())
}
