import { describe, expect, it, vi } from 'vitest'
import { createApi } from './api.ts'

/** URL・メソッド → 応答 で、fetch を差し替える。呼ばれた (メソッド URL) を calls に残す */
function stub(routes: Record<string, unknown>) {
  const calls: string[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    calls.push(key)
    for (const [pattern, body] of Object.entries(routes)) {
      if (!key.includes(pattern)) continue
      return body === null ? new Response('', { status: 404 }) : new Response(JSON.stringify(body), { status: 200 })
    }
    return new Response('', { status: 404 })
  })
  return { fetch: fn as unknown as typeof fetch, calls, fn }
}
const BASE = 'https://api.test/v2'

describe('POTA ログ(旧版 fetchAPI と同じ決まり)', () => {
  it('確認: GET /pota/log/{uuid}。見つからなければ null(例外にしない)', async () => {
    const { fetch, calls } = stub({ '/pota/log/act-1': { logId: 'act-1', lastUpdate: '2026-09-01' } })
    const api = createApi({ fetch, base: BASE })
    expect(await api.getLog('act-1')).toEqual({ logId: 'act-1', lastUpdate: '2026-09-01' })
    expect(await api.getLog('gone')).toBeNull()
    expect(calls[0]).toBe('GET https://api.test/v2/pota/log/act-1')
  })

  it('アップロード: POST /pota/log/{activator}/{hunter}。登録していない側は、文字列の null。ファイル名を送る', async () => {
    const { fetch, calls, fn } = stub({ '/pota/log/': { logKind: 'activator', logId: 'act-new' } })
    const api = createApi({ fetch, base: BASE })
    const r = await api.uploadLog(null, null, new Blob(['a,b\n']), 'activator.csv')
    expect(r).toEqual({ logKind: 'activator', logId: 'act-new' })
    expect(calls[0]).toBe('POST https://api.test/v2/pota/log/null/null')
    const body = fn.mock.calls[0][1]?.body as FormData
    expect((body.get('uploadfile') as File).name).toBe('activator.csv')
  })

  it('削除: DELETE が成功したら {}(本文なし)。失敗は null', async () => {
    const { fetch } = stub({ 'DELETE https://api.test/v2/pota/log/act-1': {}, 'pota/log/missing': null })
    const api = createApi({ fetch, base: BASE })
    expect(await api.deleteLog('act-1')).toEqual({})
    expect(await api.deleteLog('missing')).toBeNull()
  })

  it('共有: EXPORT は両方の UUID、IMPORT はキー 1 つ(2 つの形を取り違えない)', async () => {
    const { fetch, calls } = stub({ '/pota/log-share/act-1/hunt-1': { share_id: 'ABC123' }, '/pota/log-share/ABC123': { activator_logid: 'act-1', hunter_logid: 'hunt-1' } })
    const api = createApi({ fetch, base: BASE })
    expect(await api.exportShare('act-1', 'hunt-1')).toEqual({ share_id: 'ABC123' })
    expect(await api.importShare('ABC123')).toEqual({ activator_logid: 'act-1', hunter_logid: 'hunt-1' })
    expect(calls).toEqual(['GET https://api.test/v2/pota/log-share/act-1/hunt-1', 'GET https://api.test/v2/pota/log-share/ABC123'])
  })

  it('パスの各部分を URL エンコードする(旧版と同じ。UUID に空白などがあっても、パスを壊さない)', async () => {
    const { fetch, calls } = stub({ '/pota/log/': { logId: 'x', lastUpdate: '' } })
    await createApi({ fetch, base: BASE }).getLog('a b?c')
    expect(calls[0]).toBe('GET https://api.test/v2/pota/log/a%20b%3Fc')
  })

  it('通信に失敗しても、例外にならず null', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('network') }) as unknown as typeof globalThis.fetch
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await createApi({ fetch, base: BASE }).getLog('x')).toBeNull()
  })
})

describe('SOTA', () => {
  it('近くのサミット: lat・lon・dist(既定 200m)。ログ ID があれば log_id を付ける', async () => {
    const { fetch, calls } = stub({ '/sota/summits/search': [] })
    const api = createApi({ fetch, base: BASE })
    await api.summitsNear(35.44, 139.23)
    await api.summitsNear(35.44, 139.23, 200, 'hunt-1')
    expect(calls[0]).toBe('GET https://api.test/v2/sota/summits/search?lat=35.44&lon=139.23&dist=200')
    expect(calls[1]).toContain('&log_id=hunt-1')
  })
})
