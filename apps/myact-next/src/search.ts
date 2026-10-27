/**
 * 地図の範囲の山・公園を取る条件(旧版 `placeSummitMarkers`・`redrawMarkers`)。
 * ズームが小さいほど、標高と面積のしきい値を上げて、数を絞る。`zoom_threshold`(7〜12)以上では、全部。
 */
import type { SearchQuery } from './api.ts'

export interface Thresholds {
  min_elev: number
  min_area: number
}

export function thresholds(zoom: number, zoomThreshold: number): Thresholds {
  if (zoom >= zoomThreshold) return { min_elev: 0, min_area: 0 }
  if (zoom > 9) return { min_elev: 800, min_area: 1 }
  if (zoom > 8) return { min_elev: 1000, min_area: 10 }
  if (zoom > 6) return { min_elev: 1500, min_area: 20 }
  return { min_elev: 4000, min_area: 30 }
}

/** 東経 → 西経(180° をまたぐ地図。旧版 toWestLon・toEastLon) */
export const toWestLon = (lon: number) => (lon > 180 ? lon - 360 : lon)
export const toEastLon = (lon: number) => (lon < 0 ? lon + 360 : lon)

export interface Bounds {
  south: number
  west: number
  north: number
  east: number
}
/** 1 回の取得。needTrans は、結果の経度を、東経に直す(180° をまたぐとき) */
export interface Request {
  bounds: Bounds
  needTrans: boolean
}

/**
 * 地図の範囲を、取得の単位に分ける。経度が -180〜180 に収まっていれば 1 つ。
 * 東の端だけが 180° を超えれば、(西側の)東端を直した 1 つ。両方が超えるなら、180° の両側の 2 つ。
 */
export function splitBounds(b: Bounds): Request[] {
  const swlon = toWestLon(b.west)
  const nelon = toWestLon(b.east)
  if (nelon === b.east) return [{ bounds: b, needTrans: false }]
  if (swlon !== b.west) return [{ bounds: { ...b, west: swlon, east: nelon }, needTrans: true }]
  return [
    { bounds: { ...b, east: 180 }, needTrans: false },
    { bounds: { ...b, west: -180, east: nelon }, needTrans: true },
  ]
}

export function toQuery(r: Request, zoom: number, zoomThreshold: number, logId: string | null): SearchQuery {
  return {
    min_lat: r.bounds.south,
    min_lon: r.bounds.west,
    max_lat: r.bounds.north,
    max_lon: r.bounds.east,
    ...thresholds(zoom, zoomThreshold),
    log_id: logId,
  }
}

/** 取得した範囲に、いまの範囲が収まっていて、条件(ズーム・しきい値・ログ)が同じなら、取り直さない */
export function covers(fetched: { bounds: Bounds; key: string } | null, now: Bounds, key: string): boolean {
  return !!fetched && fetched.key === key && fetched.bounds.south <= now.south && fetched.bounds.north >= now.north && fetched.bounds.west <= now.west && fetched.bounds.east >= now.east
}

/** 範囲を、割合 ratio だけ広げる(少し動いても、取り直さないように。ズームが同じなら、しきい値も同じ) */
export function pad(b: Bounds, ratio: number): Bounds {
  const dLat = (b.north - b.south) * ratio
  const dLon = (b.east - b.west) * ratio
  return { south: Math.max(-90, b.south - dLat), north: Math.min(90, b.north + dLat), west: b.west - dLon, east: b.east + dLon }
}
