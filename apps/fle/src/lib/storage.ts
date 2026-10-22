/**
 * 入力中のログの保存。電池切れやタブの終了でログを失わないための、いちばん大事な部分。
 * 保存先が使えない(プライベートモード等)ときも、画面の動作は止めない。
 */

export interface KV {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const LOG_KEY = 'fle.log'
/** 「すべて消す」などで置き換える直前の内容(1世代だけ) */
const PREV_KEY = 'fle.log.prev'

/** localStorage は、アクセスしただけで例外になる環境がある */
function defaultKv(): KV | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadLog(kv: KV | null = defaultKv()): string {
  try {
    return kv?.getItem(LOG_KEY) ?? ''
  } catch {
    return ''
  }
}

/** 保存できたら true。空のログは、保存せずキーを消す。 */
export function saveLog(text: string, kv: KV | null = defaultKv()): boolean {
  if (!kv) return false
  try {
    if (text === '') kv.removeItem(LOG_KEY)
    else kv.setItem(LOG_KEY, text)
    return true
  } catch {
    return false
  }
}

export function loadPrev(kv: KV | null = defaultKv()): string {
  try {
    return kv?.getItem(PREV_KEY) ?? ''
  } catch {
    return ''
  }
}

/** 置き換える前の内容を取っておく。空白だけの内容は取っておかない。 */
export function rememberPrev(text: string, kv: KV | null = defaultKv()): void {
  if (!kv || !text.trim()) return
  try {
    kv.setItem(PREV_KEY, text)
  } catch {
    // 取っておけなくても、置き換え自体は続ける
  }
}

export function clearPrev(kv: KV | null = defaultKv()): void {
  try {
    kv?.removeItem(PREV_KEY)
  } catch {
    // 何もしない
  }
}

const CALL_KEY = 'fle.mycall'

/** 前回使った自局のコールサイン(新しいログの初期値にする) */
export function loadLastCall(kv: KV | null = defaultKv()): string {
  try {
    return kv?.getItem(CALL_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveLastCall(call: string, kv: KV | null = defaultKv()): void {
  const value = call.trim().toUpperCase()
  if (!kv || !value) return
  try {
    kv.setItem(CALL_KEY, value)
  } catch {
    // 覚えられなくても、動作には影響しない
  }
}
