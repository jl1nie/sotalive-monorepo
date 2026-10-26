import { describe, expect, it, vi } from 'vitest'
import { createReverseGeocoder } from './reverse-geocoder.ts'
import { maidenhead } from './maidenhead.ts'
import { escapeHTML } from './escape-html.ts'

const TOKYO = { lat: 35.681236, lng: 139.767125 }
const MUNI = {
  muniCode: 13101,
  prefecture: '東京都',
  municipality: '千代田区',
  jccCode: '100101',
  wardCode: null,
  maidenhead: 'PM95vq',
}

/** URL の一部 → 応答(status 付きも可)で fetch を差し替える。呼ばれた URL を calls に残す */
function stubFetch(routes: Record<string, unknown | (() => Response)>) {
  const calls: string[] = []
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    for (const [key, body] of Object.entries(routes)) {
      if (!url.includes(key)) continue
      if (typeof body === 'function') return (body as () => Response)()
      return new Response(JSON.stringify(body), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

const OK_ROUTES = {
  LonLatToAddress: { results: { muniCd: '13101', lv01Nm: '丸の内一丁目' } },
  'jcc-jcg': MUNI,
  getelevation: { elevation: 3.2, hsrc: '（5m（レーザ））' },
}

describe('reverseGeocode', () => {
  it('住所・JCC・標高を返す(大字は市区町村に足す)', async () => {
    const { fetch } = stubFetch(OK_ROUTES)
    const r = await createReverseGeocoder({ fetch })(TOKYO.lat, TOKYO.lng, { elevation: true })
    expect(r).toMatchObject({
      kind: 'ok',
      jccCode: '100101',
      prefecture: '東京都',
      municipality: '千代田区丸の内一丁目',
      maidenhead: 'PM95vq',
      elevation: 3.2,
      hsrc: '（5m（レーザ））',
    })
  })

  it('大字が「−」なら足さない', async () => {
    const { fetch } = stubFetch({ ...OK_ROUTES, LonLatToAddress: { results: { muniCd: '13101', lv01Nm: '−' } } })
    const r = await createReverseGeocoder({ fetch })(TOKYO.lat, TOKYO.lng)
    expect(r).toMatchObject({ kind: 'ok', municipality: '千代田区' })
  })

  it('自治体がなければ圏外(サーバーのグリッドロケーターを使う)', async () => {
    const { fetch } = stubFetch({
      LonLatToAddress: {},
      'jcc-jcg': () => new Response('{"error":"x"}', { status: 400 }),
    })
    const r = await createReverseGeocoder({ fetch })(30, 150, { elevation: true })
    expect(r).toEqual({ kind: 'outside', maidenhead: maidenhead(30, 150) })
  })

  it('標高が ----- なら圏外', async () => {
    const { fetch } = stubFetch({ ...OK_ROUTES, getelevation: { elevation: '-----' } })
    const r = await createReverseGeocoder({ fetch })(TOKYO.lat, TOKYO.lng, { elevation: true })
    expect(r).toMatchObject({ kind: 'outside', maidenhead: 'PM95vq' })
  })

  it('国土地理院が 500 なら error。圏外とは別で、キャッシュしない(次の呼び出しで、また問い合わせる)', async () => {
    let fail = true
    const { fetch, calls } = stubFetch({
      ...OK_ROUTES,
      LonLatToAddress: () => (fail ? new Response('', { status: 500 }) : new Response(JSON.stringify(OK_ROUTES.LonLatToAddress))),
    })
    const geocode = createReverseGeocoder({ fetch })
    expect((await geocode(TOKYO.lat, TOKYO.lng)).kind).toBe('error')
    fail = false
    expect((await geocode(TOKYO.lat, TOKYO.lng)).kind).toBe('ok')
    expect(calls.filter((u) => u.includes('LonLatToAddress'))).toHaveLength(2)
  })

  it('標高の取得に失敗したら error(圏外にしない)', async () => {
    const { fetch } = stubFetch({ ...OK_ROUTES, getelevation: () => new Response('', { status: 503 }) })
    const r = await createReverseGeocoder({ fetch })(TOKYO.lat, TOKYO.lng, { elevation: true })
    expect(r.kind).toBe('error')
  })

  it('成功は、同じ座標でキャッシュする。標高の有無は別のキー', async () => {
    const { fetch, calls } = stubFetch(OK_ROUTES)
    const geocode = createReverseGeocoder({ fetch })
    await geocode(TOKYO.lat, TOKYO.lng)
    await geocode(TOKYO.lat, TOKYO.lng)
    expect(calls.filter((u) => u.includes('LonLatToAddress'))).toHaveLength(1)
    await geocode(TOKYO.lat, TOKYO.lng, { elevation: true })
    expect(calls.filter((u) => u.includes('LonLatToAddress'))).toHaveLength(2)
  })

  it('キャッシュは cacheSize 件まで(古いものから消す)', async () => {
    const { fetch, calls } = stubFetch(OK_ROUTES)
    const geocode = createReverseGeocoder({ fetch, cacheSize: 2 })
    await geocode(1, 1)
    await geocode(2, 2)
    await geocode(3, 3)
    await geocode(1, 1)
    expect(calls.filter((u) => u.includes('LonLatToAddress'))).toHaveLength(4)
  })
})

describe('maidenhead', () => {
  it('東京駅のあたりは PM95vq 系の 8 桁', () => {
    expect(maidenhead(TOKYO.lat, TOKYO.lng)).toMatch(/^PM95vq\d\d$/)
  })
})

describe('escapeHTML', () => {
  it('& < > " \' を置き換える。null・undefined は文字にする', () => {
    expect(escapeHTML(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
    expect(escapeHTML(null)).toBe('null')
    expect(escapeHTML(undefined)).toBe('undefined')
  })
})
