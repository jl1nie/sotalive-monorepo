// LogConverter のバックエンドへの中継(pages/logconv/functions/api/v2/[[path]].ts)
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from '../../pages/logconv/functions/api/v2/[[path]].ts'

afterEach(() => vi.unstubAllGlobals())

/** 中継先への fetch を差し替え、呼ばれた URL と要求を返す */
async function relay(url: string, env: Record<string, string> = {}, init: RequestInit = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', async (target: string, options: RequestInit) => {
    calls.push({ url: target, init: options })
    return new Response('ok')
  })
  const context = { request: new Request(url, init), env } as unknown as Parameters<typeof onRequest>[0]
  const response = await onRequest(context)
  return { response, calls }
}

describe('LogConverter の中継(/api/v2)', () => {
  it('パスとクエリをそのまま、公開しているバックエンドへ渡す', async () => {
    const { response, calls } = await relay('https://logconv.sotalive.net/api/v2/logconv/pota')
    expect(calls.map((c) => c.url)).toEqual(['https://sotaapp2.sotalive.net/api/v2/logconv/pota'])
    expect(await response.text()).toBe('ok')
  })

  it('環境変数 BACKEND_URL があれば、そちらへ渡す', async () => {
    const { calls } = await relay('https://logconv.sotalive.net/api/v2/wspr/svg', { BACKEND_URL: 'https://backend.example' })
    expect(calls[0].url).toBe('https://backend.example/api/v2/wspr/svg')
  })

  it('メソッドと、元のホスト名(X-Forwarded-Host)を渡す', async () => {
    const { calls } = await relay('https://logconv.sotalive.net/api/v2/logconv/hamlog', {}, { method: 'POST', body: 'x' })
    expect(calls[0].init.method).toBe('POST')
    expect(new Headers(calls[0].init.headers).get('X-Forwarded-Host')).toBe('logconv.sotalive.net')
  })
})
