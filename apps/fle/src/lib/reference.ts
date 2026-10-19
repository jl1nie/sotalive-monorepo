/**
 * SOTA の山・POTA の公園を、sotaapp2 のバックエンドから探す(オンラインのときだけ)。
 *
 * 通信は画面(PWA)の役目。選んだコードの書式の検証は、書き込むときにコアが行う。
 * オフラインのときは候補を出さない(場所は、登る前にオンラインで入れておく前提)。
 */

/** 候補の最大件数(一覧は画面の中でスクロールする) */
const SEARCH_LIMIT = 50

export type RefKind = 'sota' | 'pota'

export interface RefCandidate {
  kind: RefKind
  /** SOTA: JA/TK-001、POTA: JP-0117 */
  code: string
  /** 表示名。日本語があれば日本語、なければ英語 */
  /** 日本語の名前(なければ英語) */
  name: string
  /** 英語の名前(あれば) */
  nameEn?: string
  /** 補足(SOTA: 標高、POTA: 対応する WWFF) */
  detail: string
  /** SOTA のポイント */
  points?: number
  /** POTA の公園に対応する WWFF のコード */
  wwff?: string
  /** グリッドロケータ(6文字、あれば) */
  grid: string
  lat: number
  lon: number
  /** 現在地からの距離(km)。近くの検索のときだけ */
  distanceKm?: number
}

export type SearchResult =
  | { status: 'ok'; items: RefCandidate[] }
  | { status: 'offline' }
  | { status: 'error' }

const API = '/api/v2'

type Json = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)

/** 'PM84co72' → 'PM84co'。4文字しかなければそのまま */
function grid6(maidenhead: unknown): string {
  const g = str(maidenhead)
  return g.length >= 6 ? g.slice(0, 6) : g.length >= 4 ? g.slice(0, 4) : ''
}

export function parseSota(raw: unknown): RefCandidate[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((r: Json) => {
    const code = str(r.summitCode)
    if (!code) return []
    const alt = num(r.altM)
    const pts = num(r.points)
    return [
      {
        kind: 'sota' as const,
        code,
        name: str(r.summitNameJ) || str(r.summitName),
        nameEn: str(r.summitName) || undefined,
        detail: Number.isNaN(alt) ? '' : `${alt}m`,
        points: Number.isNaN(pts) ? undefined : pts,
        grid: grid6(r.maidenhead),
        lat: num(r.latitude),
        lon: num(r.longitude),
      },
    ]
  })
}

export function parsePota(raw: unknown): RefCandidate[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((r: Json) => {
    const code = str(r.potaCode)
    // 休止中の公園は、運用できないので出さない
    if (!code || r.parkInactive === true) return []
    const wwff = str(r.wwffCode)
    return [
      {
        kind: 'pota' as const,
        code,
        name: str(r.parkNameJ) || str(r.parkName),
        nameEn: str(r.parkName) || undefined,
        detail: wwff,
        wwff: wwff || undefined,
        grid: grid6(r.maidenhead),
        lat: num(r.latitude),
        lon: num(r.longitude),
      },
    ]
  })
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

interface Options {
  signal?: AbortSignal
  /** テスト用に差し替える */
  fetchImpl?: typeof fetch
}

async function getJson(path: string, params: Record<string, string>, o: Options): Promise<unknown> {
  const url = `${API}${path}?${new URLSearchParams(params)}`
  const res = await (o.fetchImpl ?? fetch)(url, { signal: o.signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const PATH: Record<RefKind, string> = { sota: '/sota/summits/search', pota: '/pota/parks/search' }
const PARSE: Record<RefKind, (raw: unknown) => RefCandidate[]> = { sota: parseSota, pota: parsePota }

/** 失敗を、オフライン / 誤りに分ける。中止(AbortError)は、そのまま投げ直す */
function failure(e: unknown): SearchResult {
  if (e instanceof DOMException && e.name === 'AbortError') throw e
  return isOffline() ? { status: 'offline' } : { status: 'error' }
}

/**
 * コード・日本語名・英語名の部分一致で探す(`JA/TK-0`、`JP-01`、`高尾` など)。
 * 前の検索を中止したときは、AbortError を投げる。
 */
export async function searchByName(
  kind: RefKind,
  query: string,
  o: Options & { limit?: number } = {}
): Promise<SearchResult> {
  if (isOffline()) return { status: 'offline' }
  try {
    const raw = await getJson(PATH[kind], { name: query, limit: String(o.limit ?? SEARCH_LIMIT) }, o)
    return { status: 'ok', items: PARSE[kind](raw) }
  } catch (e) {
    return failure(e)
  }
}

/** 名前を引く場所の種類。WWFF は、対応する POTA の公園から引く(WWFF の検索はない) */
export type PlaceKind = RefKind | 'wwff'

/** 番号から引いた名前(見つからなければ空)。同じ番号を何度も問い合わせない */
const placeNames = new Map<string, string>()

/**
 * 番号(JA/ST-012、JP-1151、JAFF-0218)から、山・公園の名前を引く。
 * 見つからなければ空、オフラインや通信の誤りなら undefined(覚えず、次に引き直す)。
 */
export async function placeName(kind: PlaceKind, code: string, o: Options = {}): Promise<string | undefined> {
  const key = `${kind}|${code}`
  const known = placeNames.get(key)
  if (known !== undefined) return known
  const result = await searchByName(kind === 'wwff' ? 'pota' : kind, code, { ...o, limit: 10 })
  if (result.status !== 'ok') return undefined
  const hit = result.items.find((c) => (kind === 'wwff' ? c.wwff === code : c.code === code))
  const name = hit?.name ?? ''
  placeNames.set(key, name)
  return name
}

/** 緯度・経度を中心に、半径 km を覆う範囲 */
export function bboxAround(lat: number, lon: number, km: number) {
  const dLat = km / 111.32
  const dLon = km / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon }
}

/** 2点間の距離(km。大圏距離) */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

/** 近くを探す半径(km)。見つからなければ、次の半径に広げる */
export const NEARBY_RADII_KM = [3, 10]

/**
 * 現在地の近くの山・公園を、近い順に返す。
 * バックエンドの「中心と距離」の検索は使えない(単位の不具合、sotaapp2#11)ので、範囲で探して、
 * 距離は画面で求める。
 */
export async function searchNearby(
  lat: number,
  lon: number,
  o: Options & { max?: number } = {}
): Promise<SearchResult> {
  if (isOffline()) return { status: 'offline' }
  try {
    for (const km of NEARBY_RADII_KM) {
      const b = bboxAround(lat, lon, km)
      const params = {
        min_lat: String(b.minLat),
        max_lat: String(b.maxLat),
        min_lon: String(b.minLon),
        max_lon: String(b.maxLon),
        limit: '100',
      }
      const [sota, pota] = await Promise.all([
        getJson(PATH.sota, params, o).then(parseSota),
        getJson(PATH.pota, params, o).then(parsePota),
      ])
      const items = [...sota, ...pota]
        .map((c) => ({ ...c, distanceKm: distanceKm(lat, lon, c.lat, c.lon) }))
        .filter((c) => c.distanceKm <= km)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, o.max ?? SEARCH_LIMIT)
      if (items.length > 0) return { status: 'ok', items }
    }
    return { status: 'ok', items: [] }
  } catch (e) {
    return failure(e)
  }
}

/** 距離の表示(1km未満はメートル) */
export function distanceLabel(km: number): string {
  return km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)}m` : `${km.toFixed(1)}km`
}
