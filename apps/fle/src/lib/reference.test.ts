import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bboxAround,
  distanceKm,
  distanceLabel,
  parsePota,
  parseSota,
  searchByName,
  searchNearby,
} from './reference'

afterEach(() => vi.unstubAllGlobals())

const SOTA_ROW = {
  summitCode: 'JA/TK-001',
  summitName: 'Kumotori-yama',
  summitNameJ: '雲取山',
  altM: 2017,
  points: 10,
  maidenhead: 'PM95fm62',
  latitude: 35.8555,
  longitude: 138.9438,
}
const POTA_ROW = {
  potaCode: 'JP-0117',
  wwffCode: 'JAFF-0049',
  parkName: 'Meiji no Mori Takao',
  parkNameJ: '明治の森高尾国定公園',
  parkInactive: false,
  maidenhead: 'PM95pp12',
  latitude: 35.6334,
  longitude: 139.2658,
}

/** URLの内容に応じて返す、偽の fetch */
function fakeFetch(handler: (url: URL) => unknown): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    return { ok: true, status: 200, json: async () => handler(url) } as Response
  }) as typeof fetch
}

describe('parseSota / parsePota', () => {
  it('日本語名を優先し、標高とポイント・グリッド(6文字)を整える', () => {
    expect(parseSota([SOTA_ROW])).toEqual([
      {
        kind: 'sota',
        code: 'JA/TK-001',
        name: '雲取山',
        detail: '2017m 10点',
        grid: 'PM95fm',
        lat: 35.8555,
        lon: 138.9438,
      },
    ])
  })

  it('日本語名がなければ英語名を使う', () => {
    expect(parseSota([{ ...SOTA_ROW, summitNameJ: null }])[0].name).toBe('Kumotori-yama')
  })

  it('POTAは、対応するWWFFを持つ。休止中の公園は出さない', () => {
    const [park] = parsePota([POTA_ROW, { ...POTA_ROW, potaCode: 'JP-9999', parkInactive: true }])
    expect(park).toMatchObject({ code: 'JP-0117', wwff: 'JAFF-0049', name: '明治の森高尾国定公園' })
    expect(parsePota([{ ...POTA_ROW, parkInactive: true }])).toEqual([])
  })

  it('配列でない・コードのない行は、読み飛ばす', () => {
    expect(parseSota({ error: 1 })).toEqual([])
    expect(parseSota([{ summitName: 'x' }, null as never].filter(Boolean))).toEqual([])
  })
})

describe('bboxAround / distanceKm', () => {
  it('範囲は、半径を覆う(東西南北に半径の分)', () => {
    const b = bboxAround(35, 139, 5)
    expect(distanceKm(35, 139, b.maxLat, 139)).toBeCloseTo(5, 1)
    expect(distanceKm(35, 139, 35, b.maxLon)).toBeCloseTo(5, 1)
    expect(b.minLat).toBeLessThan(35)
    expect(b.minLon).toBeLessThan(139)
  })

  it('緯度が高いほど、経度の幅は広がる', () => {
    const low = bboxAround(0, 0, 10)
    const high = bboxAround(60, 0, 10)
    expect(high.maxLon - high.minLon).toBeGreaterThan(low.maxLon - low.minLon)
  })

  it('2点間の距離(東京タワーとスカイツリーは約8km)', () => {
    expect(distanceKm(35.6586, 139.7454, 35.7101, 139.8107)).toBeCloseTo(8.2, 0)
    expect(distanceKm(35, 139, 35, 139)).toBe(0)
  })

  it('距離の表示: 1km未満はメートル', () => {
    expect(distanceLabel(0.43)).toBe('430m')
    expect(distanceLabel(0.004)).toBe('10m')
    expect(distanceLabel(3.14)).toBe('3.1km')
  })
})

describe('searchByName', () => {
  it('種類別のAPIに、名前と件数を付けて問い合わせる', async () => {
    const seen: URL[] = []
    const fetchImpl = fakeFetch((u) => (seen.push(u), [SOTA_ROW]))
    const r = await searchByName('sota', 'JA/TK-0', { fetchImpl })
    expect(r.status).toBe('ok')
    expect(seen[0].pathname).toBe('/api/v2/sota/summits/search')
    expect(seen[0].searchParams.get('name')).toBe('JA/TK-0')
    expect(seen[0].searchParams.get('limit')).toBe('8')
    const pota = await searchByName('pota', 'JP-01', { fetchImpl: fakeFetch(() => [POTA_ROW]) })
    expect(pota.status === 'ok' && pota.items[0].code).toBe('JP-0117')
  })

  it('オフラインなら、通信せずにそう返す', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const fetchImpl = vi.fn()
    expect(await searchByName('sota', 'JA', { fetchImpl: fetchImpl as never })).toEqual({ status: 'offline' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('通信に失敗したら誤り。HTTPエラーも誤り', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const down = (async () => { throw new TypeError('network') }) as unknown as typeof fetch
    expect(await searchByName('sota', 'JA', { fetchImpl: down })).toEqual({ status: 'error' })
    const bad = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
    expect(await searchByName('sota', 'JA', { fetchImpl: bad })).toEqual({ status: 'error' })
  })

  it('通信中に電波が切れたら、オフラインとして返す', async () => {
    vi.stubGlobal('navigator', { onLine: true })
    const f = (async () => {
      vi.stubGlobal('navigator', { onLine: false })
      throw new TypeError('network')
    }) as unknown as typeof fetch
    expect(await searchByName('sota', 'JA', { fetchImpl: f })).toEqual({ status: 'offline' })
  })

  it('中止されたときは、AbortErrorを投げる(古い検索の結果を使わせない)', async () => {
    const ctrl = new AbortController()
    const f = (async () => { throw new DOMException('aborted', 'AbortError') }) as unknown as typeof fetch
    ctrl.abort()
    await expect(searchByName('sota', 'JA', { fetchImpl: f, signal: ctrl.signal })).rejects.toThrow()
  })
})

describe('searchNearby', () => {
  const near = { ...SOTA_ROW, latitude: 35.8574, longitude: 138.9442 } // 約0.2km
  const mid = { ...SOTA_ROW, summitCode: 'JA/TK-002', latitude: 35.9, longitude: 138.9442 } // 約5km

  it('範囲で問い合わせ(中心と距離は使わない)、半径内を近い順に返す', async () => {
    const seen: URL[] = []
    const r = await searchNearby(35.8574, 138.9442, {
      fetchImpl: fakeFetch((u) => {
        seen.push(u)
        return u.pathname.includes('sota') ? [mid, near] : [POTA_ROW]
      }),
    })
    expect(seen.every((u) => u.searchParams.has('min_lat') && !u.searchParams.has('dist'))).toBe(true)
    // 3km以内に見つかれば、そこで止める(5km先の山や、遠い公園は出さない)
    expect(r.status === 'ok' && r.items.map((i) => i.code)).toEqual(['JA/TK-001'])
    expect(r.status === 'ok' && r.items[0].distanceKm).toBeLessThan(1)
  })

  it('3km以内になければ、10kmに広げる', async () => {
    const calls: number[] = []
    const r = await searchNearby(35.8574, 138.9442, {
      fetchImpl: fakeFetch((u) => {
        const width = Number(u.searchParams.get('max_lat')) - Number(u.searchParams.get('min_lat'))
        calls.push(width)
        return u.pathname.includes('sota') ? [mid] : []
      }),
    })
    expect(r.status === 'ok' && r.items.map((i) => i.code)).toEqual(['JA/TK-002'])
    expect(calls[0]).toBeLessThan(calls[calls.length - 1]) // 範囲が広がった
  })

  it('範囲内でも、半径の外のものは出さない(箱の四隅)', async () => {
    const corner = { ...SOTA_ROW, latitude: 35.8574 + 0.026, longitude: 138.9442 + 0.032 } // 箱の中、距離は約4km
    const r = await searchNearby(35.8574, 138.9442, { fetchImpl: fakeFetch((u) => (u.pathname.includes('sota') ? [corner] : [])) })
    // 3kmの円の外なので最初は出ず、10kmで出る
    expect(r.status === 'ok' && r.items[0].distanceKm).toBeGreaterThan(3)
  })

  it('山と公園を合わせて、近い順に並べる', async () => {
    const park = { ...POTA_ROW, latitude: 35.8600, longitude: 138.9442, potaCode: 'JP-0001' } // 約0.5km
    const r = await searchNearby(35.8574, 138.9442, {
      fetchImpl: fakeFetch((u) => (u.pathname.includes('sota') ? [near] : [park])),
    })
    expect(r.status === 'ok' && r.items.map((i) => i.code)).toEqual(['JA/TK-001', 'JP-0001'])
  })

  it('何もなければ空', async () => {
    expect(await searchNearby(0, 0, { fetchImpl: fakeFetch(() => []) })).toEqual({ status: 'ok', items: [] })
  })

  it('オフラインなら、通信せずにそう返す', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(await searchNearby(35, 139)).toEqual({ status: 'offline' })
  })
})
