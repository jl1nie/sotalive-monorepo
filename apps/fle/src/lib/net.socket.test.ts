// netFetch を、本物のソケットで確かめる(応答を返さないサーバー・接続を拒むポート)。
// 時間の細かい確認は net.test.ts(偽のタイマー)でしているので、ここは、実際の fetch が止まった通信を途中で諦められること
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { isOffline, netFetch, OfflineError, resetNet } from './net'

let server: Server
let base = ''
let requests = 0
let mode: 'ok' | 'stall' = 'stall'

beforeAll(async () => {
  server = createServer((_req, res) => {
    requests++
    if (mode === 'stall') return // 接続は受けるが、応答を返さない(電波が弱くて通信が止まる状態)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify([{ region: 'JA/KN', updatedAt: 'v1' }]))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
beforeEach(() => {
  requests = 0
  mode = 'stall'
  resetNet()
})

describe('netFetch: 本物のソケット', () => {
  it('応答が来ない通信は、時間切れで諦め、次からは通信せずにすぐ失敗する', async () => {
    const t0 = Date.now()
    const e1 = await netFetch(`${base}/x`, {}, { timeoutMs: 200 }).catch((e: unknown) => e)
    const took = Date.now() - t0
    expect(e1).toBeInstanceOf(OfflineError)
    expect((e1 as OfflineError).reason).toBe('timeout')
    expect(took).toBeGreaterThanOrEqual(180)
    expect(took).toBeLessThan(2_000)
    expect(requests).toBe(1)

    // 遮断中: サーバーへ要求を出さず、待たずに失敗
    const t1 = Date.now()
    const e2 = await netFetch(`${base}/x`, {}, { timeoutMs: 200 }).catch((e: unknown) => e)
    expect((e2 as OfflineError).reason).toBe('blocked')
    expect(Date.now() - t1).toBeLessThan(100)
    expect(requests).toBe(1)
    expect(isOffline(base)).toBe(true)
  })

  it('force は、遮断中でも試す。応答があれば解除される', async () => {
    await netFetch(`${base}/x`, {}, { timeoutMs: 100 }).catch(() => undefined)
    expect(isOffline(base)).toBe(true)
    mode = 'ok'
    const res = await netFetch(`${base}/x`, {}, { timeoutMs: 1_000, force: true })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ region: 'JA/KN', updatedAt: 'v1' }])
    expect(isOffline(base)).toBe(false)
  })

  it('接続を拒まれたら(サーバーがいない)、すぐ OfflineError(network)', async () => {
    const dead = createServer()
    await new Promise<void>((resolve) => dead.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(dead.address() as AddressInfo).port}/x`
    await new Promise<void>((resolve) => dead.close(() => resolve()))
    const t0 = Date.now()
    const e = await netFetch(url, {}, { timeoutMs: 5_000 }).catch((err: unknown) => err)
    expect((e as OfflineError).reason).toBe('network')
    expect(Date.now() - t0).toBeLessThan(2_000)
  })

  it('呼び出し側の中止は、遮断にならない', async () => {
    const ctl = new AbortController()
    const p = netFetch(`${base}/x`, { signal: ctl.signal }, { timeoutMs: 5_000 }).catch((e: unknown) => e)
    setTimeout(() => ctl.abort(), 50)
    const e = await p
    expect((e as DOMException).name).toBe('AbortError')
    expect(isOffline(base)).toBe(false)
  })
})
