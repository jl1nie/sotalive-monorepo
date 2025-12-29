// API Client

// middlewareがプロキシするため相対パスを使用
const API_BASE = '/api/v2';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  // 検索
  search: (params: {
    minLat: number;
    minLon: number;
    maxLat: number;
    maxLon: number;
    minElev?: number;
    minArea?: number;
    logId?: string;
  }) => {
    const query = new URLSearchParams({
      min_lat: params.minLat.toString(),
      min_lon: params.minLon.toString(),
      max_lat: params.maxLat.toString(),
      max_lon: params.maxLon.toString(),
      ...(params.minElev && { min_elev: params.minElev.toString() }),
      ...(params.minArea && { min_area: params.minArea.toString() }),
      ...(params.logId && { log_id: params.logId }),
    });
    return fetchAPI<import('@/types').SearchResult>(`/search?${query}`);
  },

  searchBrief: (name: string) => {
    return fetchAPI<{ candidates: import('@/types').SearchCandidate[] }>(
      `/search/brief?name=${encodeURIComponent(name)}`
    );
  },

  // SOTAサミット
  getSotaSummit: (lat: number, lon: number, dist = 200, logId?: string) => {
    const query = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      dist: dist.toString(),
      ...(logId && { log_id: logId }),
    });
    return fetchAPI<import('@/types').SotaSummit[]>(`/sota/summits/search?${query}`);
  },

  // POTA公園
  getPotaPark: (potaCode: string, logId?: string) => {
    const query = new URLSearchParams({
      pota_code: potaCode,
      ...(logId && { log_id: logId }),
    });
    return fetchAPI<import('@/types').PotaPark[]>(`/pota/parks/search?${query}`);
  },

  // スポット
  getSpots: (params: {
    hoursAgo: number;
    byCall?: boolean;
    logId?: string;
  }) => {
    // URLSearchParamsが自動でエンコードするため、encodeURIComponentは不要
    const query = new URLSearchParams({
      pat_ref: '^(JA|JP-)',
      hours_ago: params.hoursAgo.toString(),
      ...(params.byCall ? { by_call: 'null' } : { by_ref: 'null' }),
      ...(params.logId && { log_id: params.logId }),
    });
    return fetchAPI<import('@/types').SpotGroup[]>(`/activation/spots?${query}`);
  },

  // APRSトラック
  getAprsTrack: (hoursAgo = 24) => {
    const query = new URLSearchParams({
      pat_ref: 'JA',
      hours_ago: hoursAgo.toString(),
    });
    return fetchAPI<{ tracks: import('@/types').AprsTrack[] }>(
      `/activation/aprs/track?${query}`
    );
  },

  // 地磁気指数
  getGeomag: () => {
    return fetchAPI<import('@/types').GeomagIndex>('/propagation/geomag');
  },

  // POTAログ
  getPotaLog: (logId: string) => {
    return fetchAPI<import('@/types').PotaLogInfo>(`/pota/log/${logId}`);
  },

  uploadPotaLog: (activatorId: string | null, hunterId: string | null, file: File) => {
    const formData = new FormData();
    formData.append('uploadfile', file);
    return fetchAPI<import('@/types').PotaLogInfo>(
      `/pota/log/${activatorId ?? 'null'}/${hunterId ?? 'null'}`,
      { method: 'POST', body: formData }
    );
  },

  deletePotaLog: (logId: string) => {
    return fetchAPI<Record<string, never>>(`/pota/log/${logId}`, { method: 'DELETE' });
  },

  exportPotaLog: (activatorId: string | null, hunterId: string | null) => {
    return fetchAPI<import('@/types').LogShare>(
      `/pota/log-share/${activatorId ?? 'null'}/${hunterId ?? 'null'}`
    );
  },

  importPotaLog: (shareId: string) => {
    return fetchAPI<import('@/types').LogShare>(`/pota/log-share/${shareId}`);
  },

  getLogStat: () => {
    return fetchAPI<import('@/types').LogStat>('/pota/log-stat');
  },
};
