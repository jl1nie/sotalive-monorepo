import init, { compile as wasmCompile, generateZip as wasmGenerateZip } from '../wasm/fle/fle'

/** fle-core の `compile_view` が返す、変換結果の表示用データ */
export interface FleCompileView {
  status: 'OK' | 'ERR'
  logtype: string
  mycall: string
  operator: string
  mysota: string
  mywwff: string
  mypota: string[]
  qslmsg: string
  logtext: string[][]
  hamlogtext: string[][]
}

let ready: Promise<unknown> | null = null

/** WASMの初期化は最初の呼び出し時に一度だけ行う */
function ensureReady() {
  ready ??= init()
  return ready
}

export async function compileFle(text: string): Promise<FleCompileView> {
  await ensureReady()
  // 空配列は省略されて届くので、画面側で扱いやすいよう補う
  const view = wasmCompile(text) as Partial<FleCompileView> & FleCompileView
  return { ...view, logtext: view.logtext ?? [], hamlogtext: view.hamlogtext ?? [] }
}

export async function generateFleZip(text: string, now: Date = new Date()): Promise<Uint8Array> {
  await ensureReady()
  return wasmGenerateZip(text, now.getTime())
}
