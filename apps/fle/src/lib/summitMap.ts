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
  /** all: 市区町村の中のゾーンが全部公園に入る / part: 一部だけ入る */
  coverage: 'all' | 'part'
}

export type FeatureProps =
  | { kind: 'zone' }
  | { kind: 'border' }
  | { kind: 'muni'; key: string; name: string; pota: MuniPota[] }
  | { kind: 'park'; code: string; key: string }
  | { kind: 'summit'; code: string }

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
