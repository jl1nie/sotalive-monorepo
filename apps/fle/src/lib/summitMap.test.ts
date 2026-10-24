import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  contains,
  edgeDistanceM,
  fetchRegionMaps,
  munisOf,
  parseSummitMap,
  pathOf,
  projector,
  regionOf,
  summitOf,
  whereAmI,
  zoneOf,
} from './summitMap'

afterEach(() => vi.unstubAllGlobals())

// sotaapp2 の /api/v2/sota/summits/{code}/map と同じ形(座標は小さくしたもの)
const MAP = {
  type: 'FeatureCollection',
  summit: 'JA/ST-018',
  bbox: [139.0, 36.0, 139.01, 36.01],
  attribution: '国土数値情報を加工',
  features: [
    {
      type: 'Feature',
      properties: { kind: 'zone' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [139.004, 36.004],
            [139.006, 36.004],
            [139.006, 36.006],
            [139.004, 36.006],
            [139.004, 36.004],
          ],
        ],
      },
    },
    { type: 'Feature', properties: { kind: 'border' }, geometry: { type: 'LineString', coordinates: [[139.0, 36.005], [139.01, 36.005]] } },
    {
      type: 'Feature',
      properties: { kind: 'muni', key: 'JCC#1311', name: '埼玉県本庄市', pota: [{ code: 'JP-1148', coverage: 'part' }] },
      geometry: { type: 'Point', coordinates: [139.005, 36.008] },
    },
    {
      type: 'Feature',
      properties: { kind: 'muni', key: 'JCG#13007C', name: '埼玉県長瀞町', pota: [{ code: 'JP-1148', coverage: 'all' }] },
      geometry: { type: 'Point', coordinates: [139.005, 36.002] },
    },
    { type: 'Feature', properties: { kind: 'summit', code: 'JA/ST-018' }, geometry: { type: 'Point', coordinates: [139.005, 36.005] } },
  ],
}

describe('regionOf', () => {
  it('山頂のコードから地域を取る', () => {
    expect(regionOf('JA/KN-017')).toBe('JA/KN')
    expect(regionOf(' ja5/kc-001 ')).toBe('JA5/KC')
  })
  it('山頂のコードでなければ null', () => {
    expect(regionOf('')).toBeNull()
    expect(regionOf('JP-0117')).toBeNull()
    expect(regionOf('JA/KN')).toBeNull()
  })
})

describe('parseSummitMap', () => {
  it('形が合えば読む', () => {
    const m = parseSummitMap(MAP)!
    expect(m.summit).toBe('JA/ST-018')
    expect(zoneOf(m)?.geometry.type).toBe('Polygon')
    expect(summitOf(m)).toEqual([139.005, 36.005])
    expect(munisOf(m).map((x) => x.key)).toEqual(['JCC#1311', 'JCG#13007C'])
  })
  it('崩れていれば null', () => {
    expect(parseSummitMap(null)).toBeNull()
    expect(parseSummitMap({ ...MAP, type: 'Feature' })).toBeNull()
    expect(parseSummitMap({ ...MAP, bbox: [1, 2, 3] })).toBeNull()
    expect(parseSummitMap({ ...MAP, summit: undefined })).toBeNull()
  })
  it('形の崩れた要素だけを捨てる', () => {
    const m = parseSummitMap({ ...MAP, features: [...MAP.features, { type: 'Feature' }, 3] })!
    expect(m.features).toHaveLength(MAP.features.length)
  })
})

describe('contains', () => {
  const zone = zoneOf(parseSummitMap(MAP)!)!.geometry
  it('ゾーンの中と外', () => {
    expect(contains(zone, [139.005, 36.005])).toBe(true)
    expect(contains(zone, [139.007, 36.005])).toBe(false)
  })
  it('穴の中は外', () => {
    const outer = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] as [number, number][]
    const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]] as [number, number][]
    const g = { type: 'MultiPolygon' as const, coordinates: [[outer, hole]] }
    expect(contains(g, [2, 2])).toBe(true)
    expect(contains(g, [5, 5])).toBe(false)
  })
  it('線や点は中を持たない', () => {
    expect(contains({ type: 'Point', coordinates: [0, 0] }, [0, 0])).toBe(false)
  })
})

describe('projector', () => {
  it('北西の角が原点で、緯度の縮みを直す', () => {
    const { width, height, xy, perMeter } = projector([139.0, 36.0, 139.01, 36.01], 320)
    expect(width).toBe(320)
    expect(xy([139.0, 36.01])).toEqual([0, 0])
    const [x, y] = xy([139.01, 36.0])
    expect(x).toBeCloseTo(320)
    expect(y).toBeCloseTo(height)
    // 経度 0.01 度は緯度 0.01 度より短い(北緯 36 度で cos ≒ 0.81)
    expect(height).toBeGreaterThan(width)
    expect(height / width).toBeCloseTo(1 / Math.cos((36.005 * Math.PI) / 180), 3)
    // 緯度 0.01 度 ≒ 1113 m
    expect(perMeter * 1113.2).toBeCloseTo(height, 0)
  })
})

describe('pathOf', () => {
  it('多角形は閉じ、線は閉じない', () => {
    const xy = (p: [number, number]): [number, number] => p
    expect(pathOf({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] }, xy)).toBe('M0.0,0.0L1.0,0.0L1.0,1.0Z')
    expect(pathOf({ type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]] }, xy)).toBe(
      'M0.0,0.0L1.0,1.0M2.0,2.0L3.0,3.0'
    )
    expect(pathOf({ type: 'Point', coordinates: [0, 0] }, xy)).toBe('')
  })
})

describe('fetchRegionMaps', () => {
  it('地域を指定して取り、崩れた地図は捨てる', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([MAP, { type: 'x' }]) })
    vi.stubGlobal('fetch', fetchMock)
    const maps = await fetchRegionMaps('JA/ST')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v2/sota/maps?prefix=JA%2FST')
    expect(maps?.map((m) => m.summit)).toEqual(['JA/ST-018'])
  })
  it('取れなければ null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await fetchRegionMaps('JA/ST')).toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await fetchRegionMaps('JA/ST')).toBeNull()
  })
})

describe('whereAmI: 現在地の答え', () => {
  // ゾーンは 139.004〜139.006 / 36.004〜36.006。北(36.005 より上)が本庄市、南が長瀞町。
  // 本庄市の JP-1148 は一部だけ(区域は 139.0045 より東)、長瀞町の JP-1148 は全部
  const sq = (w: number, s: number, e: number, n: number) => ({
    type: 'Polygon' as const,
    coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] as [number, number][][],
  })
  const map = parseSummitMap({
    ...MAP,
    features: [
      ...MAP.features,
      { type: 'Feature', properties: { kind: 'area', key: 'JCC#1311' }, geometry: sq(139.0, 36.005, 139.01, 36.01) },
      { type: 'Feature', properties: { kind: 'area', key: 'JCG#13007C' }, geometry: sq(139.0, 36.0, 139.01, 36.005) },
      { type: 'Feature', properties: { kind: 'park', code: 'JP-1148', key: 'JCC#1311' }, geometry: sq(139.0045, 36.005, 139.01, 36.01) },
    ],
  })!

  it('ゾーンの中で、公園の区域の中なら in', () => {
    const w = whereAmI(map, [139.0055, 36.0055], 5)
    expect(w.zone).toBe('in')
    expect(w.muni).toEqual({ key: 'JCC#1311', name: '埼玉県本庄市', near: false })
    expect(w.pota).toEqual([{ code: 'JP-1148', side: 'in' }])
  })

  it('全部入る公園は、ゾーンの中なら in', () => {
    const w = whereAmI(map, [139.005, 36.0041], 15)
    expect(w.muni?.key).toBe('JCG#13007C')
    expect(w.zone).toBe('near') // ゾーンの南の縁から 11 m、誤差 15 m
    expect(whereAmI(map, [139.005, 36.0045], 1).pota).toEqual([{ code: 'JP-1148', side: 'in' }])
  })

  it('境界が誤差より近ければ near。公園の境界は、データのずれ(20 m)も足す', () => {
    // 市区町村境(36.005)から約 11 m
    expect(whereAmI(map, [139.0055, 36.0051], 15).muni?.near).toBe(true)
    expect(whereAmI(map, [139.0055, 36.0051], 5).muni?.near).toBe(false)
    // 公園の西の縁(139.0045)から約 18 m: 誤差 5 m でも、公園は near
    expect(whereAmI(map, [139.0047, 36.0055], 5).pota).toEqual([{ code: 'JP-1148', side: 'near' }])
    // 誤差が大きければ、ゾーンの真ん中でも near
    expect(whereAmI(map, [139.005, 36.0055], 100).zone).toBe('near')
  })

  it('ゾーンの外では、POTA を判定しない', () => {
    const w = whereAmI(map, [139.008, 36.008], 5)
    expect(w.zone).toBe('out')
    expect(w.muni?.key).toBe('JCC#1311')
    expect(w.pota).toEqual([])
  })

  it('市区町村の区域がない古い地図では、ゾーンだけ', () => {
    const old = parseSummitMap(MAP)!
    expect(whereAmI(old, [139.005, 36.0055], 5)).toEqual({ zone: 'in', muni: null, pota: [] })
  })

  it('edgeDistanceM: 縁までの距離(m)', () => {
    const z = zoneOf(map)!.geometry
    // 中心から縁まで 0.001 度(経度方向は cos で縮む)
    expect(edgeDistanceM(z, [139.005, 36.005])).toBeCloseTo(0.001 * 111320 * Math.cos((36.005 * Math.PI) / 180), 0)
  })
})
