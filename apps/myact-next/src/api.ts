/**
 * sotaapp2 の API クライアント(次期 MyACT が使う分。`packages/sotalive-api` の最初の形)。
 * 旧版 `fetchAPI`(myact.js)と同じ決まり: パスの各部分を URL エンコードし、失敗(通信・ok でない応答)は null を返す(例外にしない)。
 */
export const DEFAULT_BASE = 'https://sotaapp2.sotalive.net/api/v2'

export interface PotaLogInfo {
  logId: string
  lastUpdate: string
}
export interface PotaUploadResult {
  logKind: 'activator' | 'hunter'
  logId: string
}
export interface PotaShareImport {
  activator_logid: string | null
  hunter_logid: string | null
}
export interface PotaLogStat {
  log_history: { time: string; users: number; logs: number }[]
}
export interface SotaSummit {
  summitCode: string
  summitName: string
  summitNameJ: string | null
  cityJ: string
  altM: number
  latitude: number
  longitude: number
  maidenhead: string
  points: number
  bonusPoints: number
  activationCount: number
  activationDate: string | null
  activationCall: string | null
}

export interface SotaMarker {
  code: string
  name: string
  nameJ: string
  alt: number
  lat: number
  lon: number
  pts: number
  /** アクティベーションの回数 */
  count: number
}
export interface PotaMarker {
  pota: string
  wwff: string
  name: string
  nameJ: string
  locid: string[]
  area: number
  lat: number
  lon: number
  atmpt: number | null
  act: number | null
  /** POTA ログで、活動した日(なければ null) */
  date: string | null
  qsos: number | null
}
export interface SearchResult {
  sota: SotaMarker[]
  pota: PotaMarker[]
}
export interface PotaPark {
  potaCode: string
  wwffCode: string
  parkNameJ: string
  activations?: number | null
  attempts?: number | null
  qsos?: number | null
}
export interface SearchQuery {
  min_lat: number
  min_lon: number
  max_lat: number
  max_lon: number
  min_elev: number
  min_area: number
  log_id?: string | null
}

export interface ApiOptions {
  fetch?: typeof fetch
  base?: string
}

export function createApi({ fetch: doFetch = (...a) => fetch(...a), base = DEFAULT_BASE }: ApiOptions = {}) {
  const encode = (endpoint: string) => endpoint.split('/').map(encodeURIComponent).join('/')

  /** 失敗(通信・ok でない応答)は null。DELETE は、本文なしで成功なので {} */
  async function call<T>(endpoint: string, method = 'GET', body?: FormData): Promise<T | null> {
    try {
      const res = await doFetch(base + encode(endpoint), { method, body })
      if (!res.ok) return null
      if (method === 'DELETE') return {} as T
      return (await res.json()) as T
    } catch (e) {
      console.warn(`API ${endpoint}:`, e)
      return null
    }
  }

  /** クエリ付き(GET)。パスは、エンコードしない(クエリの文字を壊さない)。signal で、前の取得を中断できる */
  async function query<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T | null> {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v))
    try {
      const res = await doFetch(`${base}${path}?${q}`, { signal })
      return res.ok ? ((await res.json()) as T) : null
    } catch (e) {
      console.warn(`API ${path}:`, e)
      return null
    }
  }

  return {
    // ---- POTA ログ(ログは、サーバーに UUID で保存される。ログインなし) ----
    getLog: (uuid: string) => call<PotaLogInfo>(`/pota/log/${uuid}`),
    /** 登録していない側の UUID は、旧版と同じく、文字列の 'null' で送る */
    uploadLog: (activator: string | null, hunter: string | null, file: File | Blob, filename?: string) => {
      const fd = new FormData()
      fd.append('uploadfile', file, filename ?? (file instanceof File ? file.name : 'log.csv'))
      return call<PotaUploadResult>(`/pota/log/${activator}/${hunter}`, 'POST', fd)
    },
    deleteLog: (logId: string) => call<Record<string, never>>(`/pota/log/${logId}`, 'DELETE'),
    exportShare: (activator: string | null, hunter: string | null) => call<{ share_id: string }>(`/pota/log-share/${activator}/${hunter}`),
    importShare: (key: string) => call<PotaShareImport>(`/pota/log-share/${key}`),
    logStat: () => query<PotaLogStat>('/pota/log-stat', {}),

    // ---- 地図の範囲の山・公園(旧版の /search)。中断(signal)されたら null ----
    search: (q: SearchQuery, signal?: AbortSignal) =>
      query<SearchResult>('/search', { ...q, log_id: q.log_id ?? undefined }, signal),
    /** 公園の詳細(ログがあれば、Activations/Attempts・QSOs も) */
    parkByCode: (potaCode: string, logId?: string | null) => query<PotaPark[]>('/pota/parks/search', { pota_code: potaCode, log_id: logId ?? undefined }),

    // ---- SOTA ----
    /** 座標の近く(dist m 以内)のサミット。ログ ID があれば付ける(旧版と同じ) */
    summitsNear: (lat: number, lon: number, dist = 200, logId?: string | null) =>
      query<SotaSummit[]>('/sota/summits/search', { lat, lon, dist, log_id: logId ?? undefined }),
  }
}

export type Api = ReturnType<typeof createApi>
