/**
 * FLEonline の通信の入口。電波のない・弱い山頂で、画面を通信で待たせない。
 *
 * `navigator.onLine` は、電波が弱くて通信が止まっていても `true` のままなので、それだけでは待たされる。そこで:
 *  1. 短い時間切れ(既定 5 秒)を付ける。
 *  2. 通信が失敗(接続できない・時間切れ)したら、その接続先を「止まっている」と覚え、しばらくは通信せずに
 *     すぐ `OfflineError` を返す(遮断)。機能ごとに時間切れを待たない。間隔は 10 秒から倍々で、上限 120 秒。
 *  3. `online` イベントか、通信の成功で解除する。
 *
 * HTTP のエラー(4xx・5xx)と、呼び出し側の中止(入力のたびの検索の中止など)は、通信が生きている証拠なので、
 * 遮断しない。利用者が押した操作は `force` で、遮断を無視して試す。遮断は画面を開き直すと忘れる(メモリだけ)。
 */

/** 通信できない(オフライン・遮断中・時間切れ・接続できない)。画面は「オフライン」として扱う */
export class OfflineError extends Error {
  readonly reason: 'offline' | 'blocked' | 'timeout' | 'network'
  constructor(reason: OfflineError['reason']) {
    super(`offline: ${reason}`)
    this.name = 'OfflineError'
    this.reason = reason
  }
}

export const DEFAULT_TIMEOUT_MS = 5_000
const BLOCK_INITIAL_MS = 10_000
const BLOCK_MAX_MS = 120_000

export interface NetOptions {
  /** 応答が始まるまでの時間切れ(ミリ秒) */
  timeoutMs?: number
  /** 遮断を無視して試す(利用者が押した操作) */
  force?: boolean
  /** テスト用に差し替える */
  fetchImpl?: typeof fetch
}

interface Breaker {
  /** この時刻まで遮断 */
  until: number
  /** 今回の遮断の長さ。次に失敗したら倍にする */
  backoff: number
}

const breakers = new Map<string, Breaker>()
const expiry = new Map<string, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()

function notify() {
  for (const f of [...listeners]) f()
}

/** 遮断の変化(入った・解けた・期限が切れた)を知らせてもらう。解除の関数を返す */
export function subscribeNet(f: () => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}

function appOrigin(): string {
  return typeof location !== 'undefined' && location.origin && location.origin !== 'null' ? location.origin : 'http://localhost'
}

function originOf(url: string): string {
  try {
    return new URL(url, appOrigin()).origin
  } catch {
    return appOrigin()
  }
}

const browserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

function trip(origin: string, now: number) {
  const prev = breakers.get(origin)
  // 前の遮断から十分たっていれば、10 秒からやり直す
  const fresh = !prev || now - prev.until > BLOCK_MAX_MS
  const backoff = fresh ? BLOCK_INITIAL_MS : Math.min(prev.backoff * 2, BLOCK_MAX_MS)
  breakers.set(origin, { until: now + backoff, backoff })
  clearTimeout(expiry.get(origin))
  // 期限が切れたら画面に知らせる(オフラインの表示を戻す)
  expiry.set(origin, setTimeout(notify, backoff))
  notify()
}

function succeed(origin: string) {
  if (breakers.delete(origin)) {
    clearTimeout(expiry.get(origin))
    expiry.delete(origin)
    notify()
  }
}

/** すべての遮断を解く(`online` イベント、テスト) */
export function resetNet() {
  const had = breakers.size > 0
  breakers.clear()
  for (const t of expiry.values()) clearTimeout(t)
  expiry.clear()
  if (had) notify()
}

if (typeof window !== 'undefined') window.addEventListener('online', resetNet)

/**
 * 通信が止まっているか。端末がオフライン、またはその接続先が遮断中なら true。
 * `url` を渡すとその接続先、なければこのアプリの接続先(sotaapp2 の API は同じ接続先)
 */
export function isOffline(url?: string, now = Date.now()): boolean {
  if (browserOffline()) return true
  const b = breakers.get(url ? originOf(url) : appOrigin())
  return b !== undefined && now < b.until
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/**
 * `fetch` の代わり。通信できないときは `OfflineError`(待たずに、または短い時間切れで)。
 * 中止(`init.signal`)は、そのまま AbortError を投げる。
 */
export async function netFetch(url: string, init: RequestInit = {}, opts: NetOptions = {}): Promise<Response> {
  const caller = init.signal ?? undefined
  if (caller?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (browserOffline()) throw new OfflineError('offline')
  const origin = originOf(url)
  if (!opts.force) {
    const b = breakers.get(origin)
    if (b && Date.now() < b.until) throw new OfflineError('blocked')
  }

  const ctl = new AbortController()
  const onAbort = () => ctl.abort()
  caller?.addEventListener('abort', onAbort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctl.abort()
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, { ...init, signal: ctl.signal })
    succeed(origin) // HTTP のエラーでも、サーバーに届いている
    return res
  } catch (e) {
    if (timedOut) {
      trip(origin, Date.now())
      throw new OfflineError('timeout')
    }
    if (caller?.aborted || isAbort(e)) throw e
    trip(origin, Date.now())
    throw new OfflineError('network')
  } finally {
    clearTimeout(timer)
    caller?.removeEventListener('abort', onAbort)
  }
}

/**
 * 応答の本文を JSON で読む。本文の途中で止まったときも、`timeoutMs` で諦める(大きい応答用)。
 * 時間切れは `OfflineError`(その接続先を遮断する)
 */
export async function readJson(res: Response, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      trip(originOf(res.url || appOrigin()), Date.now())
      reject(new OfflineError('timeout'))
    }, timeoutMs)
  })
  try {
    return await Promise.race([res.json() as Promise<unknown>, stalled])
  } finally {
    clearTimeout(timer)
  }
}
