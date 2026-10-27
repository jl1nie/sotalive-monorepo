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

  /** クエリ付き(GET)。パスは、エンコードしない(クエリの文字を壊さない) */
  async function query<T>(path: string, params: Record<string, string | number | undefined>): Promise<T | null> {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v))
    try {
      const res = await doFetch(`${base}${path}?${q}`)
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

    // ---- SOTA ----
    /** 座標の近く(dist m 以内)のサミット。ログ ID があれば付ける(旧版と同じ) */
    summitsNear: (lat: number, lon: number, dist = 200, logId?: string | null) =>
      query<SotaSummit[]>('/sota/summits/search', { lat, lon, dist, log_id: logId ?? undefined }),
  }
}

export type Api = ReturnType<typeof createApi>
