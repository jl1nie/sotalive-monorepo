/**
 * 山頂の簡易地図(sotaapp2 が返す GeoJSON)。アクティベーションゾーン・市区町村境・市区町村ごとの POTA と、
 * 一部だけ公園に入る市区町村の公園の区域が入っている。
 *
 * 地図は地域(JA/KN など)ごとに、オンラインのうちに端末へ保存しておき、山頂ではオフラインで GPS と重ねて見る。
 * ここは形の検査・座標の変換・点がゾーンの中かの判定だけ(保存は mapStore、描画は MapSheet)。
 */

const API = '/api/v2'

type Position = [number, number]
type Ring = Position[]

export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'MultiLineString'; coordinates: Position[][] }
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] }

export interface MuniPota {
  code: string
  /** 公園名(sotaapp2 の POTA の参照データ)。古い地図にはない */
  name?: string
  /** all: 市区町村の中のゾーンが全部公園に入る / part: 一部だけ入る */
  coverage: 'all' | 'part'
}

export type FeatureProps =
  | { kind: 'zone' }
  | { kind: 'border' }
  | { kind: 'muni'; key: string; name: string; pota: MuniPota[] }
  | { kind: 'park'; code: string; key: string }
  | { kind: 'area'; key: string }
  | { kind: 'summit'; code: string; name?: string }

export interface Feature {
  type: 'Feature'
  properties: FeatureProps
  geometry: Geometry
}

export interface SummitMap {
  type: 'FeatureCollection'
  summit: string
  /** [西, 南, 東, 北] */
  bbox: [number, number, number, number]
  attribution: string
  features: Feature[]
}

/** 'JA/KN-017' → 'JA/KN'。地域が読めなければ null */
export function regionOf(summit: string): string | null {
  const m = /^([A-Z0-9]+)\/([A-Z]{2})-\d+$/.exec(summit.trim().toUpperCase())
  return m ? `${m[1]}/${m[2]}` : null
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** 地図の形を確かめる。崩れていれば null(古い版の保存データや、途中で切れた応答を描かない) */
export function parseSummitMap(raw: unknown): SummitMap | null {
  if (!isObj(raw) || raw.type !== 'FeatureCollection' || typeof raw.summit !== 'string') return null
  const bbox = raw.bbox
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((v) => typeof v === 'number')) return null
  if (!Array.isArray(raw.features)) return null
  const features = raw.features.filter(
    (f): f is Feature => isObj(f) && isObj(f.properties) && isObj(f.geometry) && typeof f.properties.kind === 'string'
  )
  return {
    type: 'FeatureCollection',
    summit: raw.summit,
    bbox: bbox as SummitMap['bbox'],
    attribution: typeof raw.attribution === 'string' ? raw.attribution : '',
    features,
  }
}

/** 地域の地図をまとめて取る。取れなければ null(オフライン・未対応の地域) */
export async function fetchRegionMaps(region: string, init?: { signal?: AbortSignal }): Promise<SummitMap[] | null> {
  try {
    const res = await fetch(`${API}/sota/maps?prefix=${encodeURIComponent(region)}`, init)
    if (!res.ok) return null
    const raw: unknown = await res.json()
    if (!Array.isArray(raw)) return null
    return raw.map(parseSummitMap).filter((m): m is SummitMap => m !== null)
  } catch {
    return null
  }
}

export const zoneOf = (map: SummitMap): Feature | undefined => map.features.find((f) => f.properties.kind === 'zone')

export const munisOf = (map: SummitMap) =>
  map.features.flatMap((f) => (f.properties.kind === 'muni' ? [{ ...f.properties, geometry: f.geometry }] : []))

/** 山頂の名前(古い地図にはない) */
export const summitNameOf = (map: SummitMap): string => {
  const f = map.features.find((x) => x.properties.kind === 'summit')
  return f?.properties.kind === 'summit' ? (f.properties.name ?? '') : ''
}

export const summitOf = (map: SummitMap): Position | null => {
  const f = map.features.find((x) => x.properties.kind === 'summit')
  return f?.geometry.type === 'Point' ? f.geometry.coordinates : null
}

function polygonsOf(g: Geometry): Ring[][] {
  if (g.type === 'Polygon') return [g.coordinates]
  if (g.type === 'MultiPolygon') return g.coordinates
  return []
}

function inRing([x, y]: Position, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 点(経度, 緯度)が多角形の中か。穴の中は外 */
export function contains(g: Geometry, p: Position): boolean {
  return polygonsOf(g).some(([outer, ...holes]) => outer && inRing(p, outer) && !holes.some((h) => inRing(p, h)))
}

/**
 * 経緯度を、地図の SVG の座標(幅 width、上が北)に変える。狭い範囲なので、緯度の縮みだけを直した平面で描く。
 * 返す height は bbox の縦横比から決まる
 */
export function projector(bbox: SummitMap['bbox'], width: number) {
  const [w, s, e, n] = bbox
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180)
  const scale = width / ((e - w) * k)
  const height = (n - s) * scale
  const xy = ([lon, lat]: Position): Position => [(lon - w) * k * scale, (n - lat) * scale]
  /** 1 m が何単位か(縮尺の棒や、GPS の誤差の円に使う) */
  const perMeter = scale / 111320
  return { width, height, xy, perMeter }
}

/** 多角形・線を SVG の path の d にする */
export function pathOf(g: Geometry, xy: (p: Position) => Position): string {
  const line = (pts: Position[], close: boolean) =>
    pts.length === 0
      ? ''
      : 'M' + pts.map((p) => xy(p).map((v) => v.toFixed(1)).join(',')).join('L') + (close ? 'Z' : '')
  switch (g.type) {
    case 'LineString':
      return line(g.coordinates, false)
    case 'MultiLineString':
      return g.coordinates.map((l) => line(l, false)).join('')
    case 'Polygon':
    case 'MultiPolygon':
      return polygonsOf(g)
        .flat()
        .map((r) => line(r, true))
        .join('')
    default:
      return ''
  }
}

/** 公園の境界は、この距離(m、GPS の誤差に足す)より近ければ言い切らない(公園区域のデータには数十 m のずれがある) */
export const EDGE_M = 20

/** 中・外・境界付近 */
export type Side = 'in' | 'out' | 'near'

/** 現在地の答え。古い地図(市区町村の区域がない)では muni は null */
export interface Where {
  zone: Side
  muni: { key: string; name: string; near: boolean } | null
  /** その市区町村で当たる POTA と、現在地がその公園の中か。ゾーンの外なら空 */
  pota: { code: string; name: string; side: Side }[]
}

/** 点から、多角形の縁までの距離(m)。狭い範囲なので、緯度の縮みだけを直した平面で測る */
export function edgeDistanceM(g: Geometry, [lon, lat]: Position): number {
  const k = Math.cos((lat * Math.PI) / 180)
  const m = ([x, y]: Position): Position => [(x - lon) * k * 111320, (y - lat) * 111320]
  let best = Infinity
  for (const ring of polygonsOf(g).flat()) {
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = m(ring[i - 1])
      const [bx, by] = m(ring[i])
      const dx = bx - ax
      const dy = by - ay
      const len = dx * dx + dy * dy
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len))
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
    }
  }
  return best
}

function sideOf(g: Geometry, p: Position, margin: number): Side {
  if (edgeDistanceM(g, p) < margin) return 'near'
  return contains(g, p) ? 'in' : 'out'
}

/**
 * 現在地(経度, 緯度)と GPS の誤差(m)から、ゾーン・市区町村・当たる POTA の中か外かを答える。
 * 境界が GPS の誤差より近ければ near(言い切らない)。公園の境界は、データのずれ(EDGE_M)も足す。
 * ゾーン(同じ標高データから作る)と市区町村境(国土数値情報)は、ずれが小さいので誤差だけ
 */
export function whereAmI(map: SummitMap, p: Position, accuracy: number): Where {
  const margin = Math.max(0, accuracy)
  const zoneF = zoneOf(map)
  const zone: Side = zoneF ? sideOf(zoneF.geometry, p, margin) : 'out'
  const area = map.features.find((f) => f.properties.kind === 'area' && contains(f.geometry, p))
  const key = area?.properties.kind === 'area' ? area.properties.key : null
  const m = key ? munisOf(map).find((x) => x.key === key) : undefined
  const muni = m && area ? { key: m.key, name: m.name, near: edgeDistanceM(area.geometry, p) < margin } : null
  const pota =
    m && zone !== 'out'
      ? m.pota.map((q) => {
          const name = q.name ?? ''
          if (q.coverage === 'all') return { code: q.code, name, side: zone }
          // 一部だけ入る公園: その市区町村の中の公園の区域で判定する
          const park = map.features.find(
            (f) => f.properties.kind === 'park' && f.properties.code === q.code && f.properties.key === m.key
          )
          return { code: q.code, name, side: park ? sideOf(park.geometry, p, margin + EDGE_M) : ('near' as Side) }
        })
      : []
  return { zone, muni, pota }
}
