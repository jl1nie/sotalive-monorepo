import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOffline, netFetch, OfflineError, readJson, resetNet, subscribeNet } from './net'

const ok = () => Promise.resolve(new Response('{}', { status: 200 }))
const refuse = () => Promise.reject(new TypeError('Failed to fetch'))
/** 応答が来ない通信。中止されたら AbortError で終わる */
const hang = (_url: RequestInfo | URL, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })
const spy = (impl: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => vi.fn(impl) as unknown as typeof fetch & ReturnType<typeof vi.fn>

const URL_A = 'https://a.example/api/x'
const URL_B = 'https://b.example/api/y'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-25T00:00:00Z'))
  vi.stubGlobal('navigator', { onLine: true })
  resetNet()
})
afterEach(() => {
  resetNet()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** 失敗するまで待つ(時間切れの分だけ時計を進める) */
async function failing(p: Promise<unknown>, ms = 0) {
  const caught = p.then(
    () => null,
    (e: unknown) => e
  )
  if (ms) await vi.advanceTimersByTimeAsync(ms)
  return caught
}

describe('netFetch: 待たせない', () => {
  it('端末がオフラインなら、通信せずにすぐ OfflineError', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const f = spy(ok)
    const e = await failing(netFetch(URL_A, {}, { fetchImpl: f }))
    expect(e).toBeInstanceOf(OfflineError)
    expect((e as OfflineError).reason).toBe('offline')
    expect(f).not.toHaveBeenCalled()
    expect(isOffline()).toBe(true)
  })

  it('応答が来なければ、時間切れ(既定 5 秒)で OfflineError。以後は遮断', async () => {
    const e = await failing(netFetch(URL_A, {}, { fetchImpl: hang }), 5_000)
    expect(e).toBeInstanceOf(OfflineError)
    expect((e as OfflineError).reason).toBe('timeout')
    expect(isOffline(URL_A)).toBe(true)
  })

  it('時間切れは、指定でき、その時間より前には切れない', async () => {
    let settled = false
    const p = netFetch(URL_A, {}, { fetchImpl: hang, timeoutMs: 100 }).catch(() => (settled = true))
    await vi.advanceTimersByTimeAsync(99)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await p
    expect(settled).toBe(true)
  })

  it('接続できなければ(TypeError)、OfflineError(network)になり、遮断が入る', async () => {
    const e = await failing(netFetch(URL_A, {}, { fetchImpl: refuse }))
    expect((e as OfflineError).reason).toBe('network')
    expect(isOffline(URL_A)).toBe(true)
  })

  it('遮断中は、通信せずに、すぐ OfflineError(blocked)', async () => {
    await failing(netFetch(URL_A, {}, { fetchImpl: refuse }))
    const f = spy(ok)
    const e = await failing(netFetch(URL_A, {}, { fetchImpl: f }))
    expect((e as OfflineError).reason).toBe('blocked')
    expect(f).not.toHaveBeenCalled()
  })
})

describe('netFetch: 遮断の長さと解除', () => {
  it('10 秒たつと、1 回試す。成功すれば解除', async () => {
    await failing(netFetch(URL_A, {}, { fetchImpl: refuse }))
    await vi.advanceTimersByTimeAsync(9_999)
    expect(isOffline(URL_A)).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(isOffline(URL_A)).toBe(false)
    const res = await netFetch(URL_A, {}, { fetchImpl: ok })
    expect(res.status).toBe(200)
    expect(isOffline(URL_A)).toBe(false)
  })

  it('試して失敗するたびに、間隔が倍になる(上限 120 秒)', async () => {
    const lengths: number[] = []
    for (let i = 0; i < 7; i++) {
      await failing(netFetch(URL_A, {}, { fetchImpl: refuse }))
      let ms = 0
      while (isOffline(URL_A) && ms < 200_000) {
        await vi.advanceTimersByTimeAsync(1_000)
        ms += 1_000
      }
      lengths.push(ms)
    }
    expect(lengths).toEqual([10_000, 20_000, 40_000, 80_000, 120_000, 120_000, 120_000])
  })

  it('長い間、失敗していなければ、10 秒からやり直す', async () => {
    await failing(netFetch(URL_A, {}, { fetchImpl: refuse }))
    await vi.advanceTimersByTimeAsync(10_000)
    await failing(netFetch(URL_A, {}, { fetchImpl: refuse })) // 20 秒
    await vi.advanceTimersByTimeAsync(20_000 + 130_000)
    await failing(netFetch(URL_A, {}, { fetchImpl: refuse }))
    await vi.advanceTimersByTimeAsync(9_999)
    expect(isOffline(URL_A)).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(isOffline(URL_A)).toBe(false)
  })

  it('online イベント(resetNet)で、すぐ解除', async () => {
    await failing(netFetch(URL_A, {}, { fetchImpl: refuse }))
    expect(isOffline(URL_A)).toBe(true)
    resetNet()
    expect(isOffline(URL_A)).toBe(false)
  })

  it('force は、遮断を無視して試す。成功すれば解除', async () => {
    await failing(netFetch(URL_A, {}, { fetchImpl: refuse }))
    const f = spy(ok)
    const res = await netFetch(URL_A, {}, { fetchImpl: f, force: true })
    expect(res.ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
    expect(isOffline(URL_A)).toBe(false)
  })

  it('force でも、端末がオフラインなら通信しない', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const f = spy(ok)
    const e = await failing(netFetch(URL_A, {}, { fetchImpl: f, force: true }))
    expect(e).toBeInstanceOf(OfflineError)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('netFetch: 遮断しないもの', () => {
  it('HTTP のエラー(5xx・4xx)は、サーバーに届いているので遮断しない', async () => {
    const res = await netFetch(URL_A, {}, { fetchImpl: () => Promise.resolve(new Response('', { status: 503 })) })
    expect(res.status).toBe(503)
    expect(isOffline(URL_A)).toBe(false)
    const res2 = await netFetch(URL_A, {}, { fetchImpl: () => Promise.resolve(new Response('', { status: 404 })) })
    expect(res2.status).toBe(404)
  })

  it('呼び出し側の中止は、AbortError のまま。遮断しない', async () => {
    const ctl = new AbortController()
    const p = failing(netFetch(URL_A, { signal: ctl.signal }, { fetchImpl: hang }))
    ctl.abort()
    const e = await p
    expect(e).toBeInstanceOf(DOMException)
    expect((e as DOMException).name).toBe('AbortError')
    expect(isOffline(URL_A)).toBe(false)
  })

  it('最初から中止されていれば、通信しない', async () => {
    const ctl = new AbortController()
    ctl.abort()
    const f = spy(ok)
    const e = await failing(netFetch(URL_A, { signal: ctl.signal }, { fetchImpl: f }))
    expect((e as DOMException).name).toBe('AbortError')
    expect(f).not.toHaveBeenCalled()
  })

  it('接続先ごとに別。片方が止まっていても、もう片方は通信できる', async () => {
    await failing(netFetch(URL_A, {}, { fetchImpl: refuse }))
    expect(isOffline(URL_A)).toBe(true)
    expect(isOffline(URL_B)).toBe(false)
    expect(isOffline()).toBe(false) // このアプリの接続先
    const res = await netFetch(URL_B, {}, { fetchImpl: ok })
    expect(res.ok).toBe(true)
  })

  it('相対 URL は、このアプリの接続先として扱う', async () => {
    await failing(netFetch('/api/v2/x', {}, { fetchImpl: refuse }))
    expect(isOffline()).toBe(true)
    expect(isOffline('/api/v2/other')).toBe(true)
  })
})

describe('subscribeNet / readJson', () => {
  it('遮断に入ったとき、解けたとき、期限が切れたときに知らせる', async () => {
    const seen = vi.fn()
    const off = subscribeNet(seen)
    await failing(netFetch(URL_A, {}, { fetchImpl: refuse }))
    expect(seen).toHaveBeenCalledTimes(1) // 入った
    await vi.advanceTimersByTimeAsync(10_000)
    expect(seen).toHaveBeenCalledTimes(2) // 期限が切れた
    off()
    resetNet()
    expect(seen).toHaveBeenCalledTimes(2) // 解除後は呼ばない
  })

  it('readJson: 本文を JSON で読む', async () => {
    expect(await readJson(new Response('{"a":1}'))).toEqual({ a: 1 })
  })

  it('readJson: 本文の途中で止まったら、時間切れで OfflineError。遮断が入る', async () => {
    const res = { url: URL_A, json: () => new Promise(() => {}) } as unknown as Response
    const e = await failing(readJson(res, 30_000), 30_000)
    expect((e as OfflineError).reason).toBe('timeout')
    expect(isOffline(URL_A)).toBe(true)
  })

  it('readJson: JSON が壊れていれば、そのままのエラー(オフライン扱いにしない)', async () => {
    const e = await failing(readJson(new Response('not json')))
    expect(e).toBeInstanceOf(SyntaxError)
    expect(isOffline()).toBe(false)
  })
})
