// API Response Types

/** スポットデータ */
export interface Spot {
  activator: string;
  frequency: string;
  mode: string;
  program: 'SOTA' | 'POTA';
  reference: string;
  referenceDetail: string;
  spotTime: string;
  spotter: string;
  comment: string;
  qsos?: number | null;
}

/** スポットグループ（リファレンスまたはコールサイン別） */
export interface SpotGroup {
  key: string;
  values: Spot[];
}

/** SOTAサミット情報 */
export interface SotaSummit {
  summitCode: string;
  summitName: string;
  summitNameJ?: string;
  latitude: number;
  longitude: number;
  altM: number;
  points: number;
  bonusPoints: number;
  activationCount: number;
  activationDate?: string;
  activationCall?: string;
  maidenhead: string;
  cityJ?: string;
}

/** POTA公園情報 */
export interface PotaPark {
  potaCode: string;
  wwffCode?: string;
  parkName: string;
  parkNameJ?: string;
  latitude: number;
  longitude: number;
  activations?: number;
  attempts?: number;
  qsos?: number | null;
}

/** 検索結果（マーカー表示用） */
export interface SearchResult {
  sota: SotaSummitMarker[];
  pota: PotaParkMarker[];
}

export interface SotaSummitMarker {
  lat: number;
  lon: number;
  alt: number;
  count: number;
}

export interface PotaParkMarker {
  lat: number;
  lon: number;
  pota: string;
  wwff: string;
  nameJ: string;
  date?: string;
  locid: string[];
  act?: number;
}

/** 検索候補 */
export interface SearchCandidate {
  code: string;
  name: string;
  lat: number;
  lon: number;
}

/** APRSトラック */
export interface AprsTrack {
  properties: AprsProperties;
  geometry: AprsGeometry;
}

export interface AprsProperties {
  ssid: string;
  callsign: string;
  lastseen: string;
  distance: number;
  summit: string;
  spot_summit?: string;
  spot_time?: string;
  spot_freq?: string;
  spot_mode?: string;
  spot_comment?: string;
}

export interface AprsGeometry {
  coordinates: [number, number][];
}

/** 逆ジオコーダー応答 */
export interface ReverseGeocodeResult {
  errors: 'OK' | 'OUTSIDE_JA' | 'ERROR' | string;
  prefecture?: string;
  municipality?: string;
  addr1?: string; // 詳細住所（GSI逆ジオコーダーから）
  jccCode?: string;
  jcgCode?: string;
  jccText?: string;
  wardCode?: string;
  hamlogCode?: string;
  jcgText?: string;
  maidenhead: string;
  elevation?: number;
  hsrc?: string;
  areacode?: string[];
}

/** 地磁気指数 */
export interface GeomagIndex {
  kIndex: number[];
  aIndex: number;
}

/** POTAログ情報 */
export interface PotaLogInfo {
  logId: string;
  logKind: 'activator' | 'hunter';
  lastUpdate: string;
}

/** ログ統計 */
export interface LogStatHistory {
  time: string;
  users: number;
  logs: number;
}

export interface LogStat {
  log_history: LogStatHistory[];
  longest_entry: number;
  query_latency: number;
}

/** ログ共有 */
export interface LogShare {
  share_id: string;
  activator_logid?: string;
  hunter_logid?: string;
}
