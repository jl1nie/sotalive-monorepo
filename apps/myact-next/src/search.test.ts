import { describe, expect, it } from 'vitest'
import { covers, pad, splitBounds, thresholds, toEastLon, toQuery, toWestLon } from './search.ts'

describe('thresholds(旧版 placeSummitMarkers と同じ)', () => {
  it('zoom_threshold 以上は全部。そのほかは、ズームが小さいほど絞る', () => {
    expect(thresholds(12, 12)).toEqual({ min_elev: 0, min_area: 0 })
    expect(thresholds(11, 12)).toEqual({ min_elev: 800, min_area: 1 })
    expect(thresholds(10, 12)).toEqual({ min_elev: 800, min_area: 1 })
    expect(thresholds(9, 12)).toEqual({ min_elev: 1000, min_area: 10 })
    expect(thresholds(8, 12)).toEqual({ min_elev: 1500, min_area: 20 })
    expect(thresholds(7, 12)).toEqual({ min_elev: 1500, min_area: 20 })
    expect(thresholds(6, 12)).toEqual({ min_elev: 4000, min_area: 30 })
  })
  it('zoom_threshold を下げると、小さいズームでも全部', () => {
    expect(thresholds(8, 7)).toEqual({ min_elev: 0, min_area: 0 })
  })
})

describe('180° をまたぐ地図', () => {
  const b = (west: number, east: number) => ({ south: 30, north: 40, west, east })
  it('収まっていれば 1 つ', () => {
    expect(splitBounds(b(130, 150))).toEqual([{ bounds: b(130, 150), needTrans: false }])
  })
  it('両方の端が 180 を超えるとき(185〜195)は、西経に直した 1 つ。結果の経度は、東経に直す', () => {
    const r = splitBounds(b(185, 195))
    expect(r).toEqual([{ bounds: b(-175, -165), needTrans: true }])
  })
  it('西に -180 を超える範囲は、旧版と同じく、そのまま 1 つ(変換しない)', () => {
    expect(splitBounds(b(-190, -170))).toEqual([{ bounds: b(-190, -170), needTrans: false }])
  })
  it('東の端だけが 180 を超えるとき(170〜190)は、180 の両側の 2 つ', () => {
    const r = splitBounds(b(170, 190))
    expect(r).toHaveLength(2)
    expect(r[0].bounds.east).toBe(180)
    expect(r[1].bounds.west).toBe(-180)
    expect(r[1].needTrans).toBe(true)
  })
  it('経度の変換', () => {
    expect(toWestLon(190)).toBe(-170)
    expect(toEastLon(-170)).toBe(190)
    expect(toWestLon(139)).toBe(139)
  })
})

describe('クエリ・取り直しの判断', () => {
  it('toQuery: 範囲・しきい値・log_id', () => {
    const q = toQuery({ bounds: { south: 35.3, west: 139.1, north: 35.5, east: 139.3 }, needTrans: false }, 13, 12, 'hunt-1')
    expect(q).toEqual({ min_lat: 35.3, min_lon: 139.1, max_lat: 35.5, max_lon: 139.3, min_elev: 0, min_area: 0, log_id: 'hunt-1' })
  })
  it('covers: 同じ条件で、収まっていれば true。条件(key)が違えば false', () => {
    const fetched = { bounds: { south: 35, west: 139, north: 36, east: 140 }, key: '13|12|-' }
    expect(covers(fetched, { south: 35.2, west: 139.2, north: 35.8, east: 139.8 }, '13|12|-')).toBe(true)
    expect(covers(fetched, { south: 35.2, west: 139.2, north: 35.8, east: 139.8 }, '13|12|hunt-1')).toBe(false)
    expect(covers(fetched, { south: 34.9, west: 139.2, north: 35.8, east: 139.8 }, '13|12|-')).toBe(false)
    expect(covers(null, { south: 0, west: 0, north: 1, east: 1 }, 'x')).toBe(false)
  })
  it('pad: 割合だけ広げる(緯度は 90 を超えない)', () => {
    expect(pad({ south: 10, west: 100, north: 20, east: 120 }, 0.5)).toEqual({ south: 5, west: 90, north: 25, east: 130 })
    expect(pad({ south: 80, west: 0, north: 90, east: 10 }, 1).north).toBe(90)
  })
})
