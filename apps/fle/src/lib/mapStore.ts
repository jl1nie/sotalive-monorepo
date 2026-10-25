/**
 * 簡易地図の保存(IndexedDB)。地域(JA/KN など)ごとに、その地域の全山頂の地図をまとめて持つ。
 * 地域ひとつで 1 MB ほどあるので、localStorage(ログの保存先)には置かない。
 * 保存先が使えない(プライベートモード等)ときは、保存しないだけで画面は止めない。
 */
import { isOffline } from '@/lib/net'
import { fetchRegionMaps, fetchRegionVersion, parseSummitMap, regionOf, type SummitMap } from '@/lib/summitMap'

const DB_NAME = 'fle-maps'
const STORE = 'regions'

interface RegionRecord {
  region: string
  /** 保存した時刻(ISO 8601) */
  savedAt: string
  /**
   * 保存した地図の版(サーバーが配信用の地図を作り直した日時)。サーバーの版と等しければ取り直さない。
   * 端末の時計を使わないので、時計がずれていても動く。ない記録(古い版で保存した)は、一度取り直す
   */
  version?: string
  maps: unknown[]
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'region' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function withStore<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode)
      const req = f(tx.objectStore(STORE))
      tx.oncomplete = () => {
        db.close()
        resolve(req.result)
      }
      tx.onerror = tx.onabort = () => {
        db.close()
        resolve(null)
      }
    } catch {
      db.close()
      resolve(null)
    }
  })
}

/** 地域の地図を保存する。保存できたら true */
export async function saveRegion(region: string, maps: SummitMap[], version?: string): Promise<boolean> {
  const rec: RegionRecord = { region, savedAt: new Date().toISOString(), ...(version ? { version } : {}), maps }
  return (await withStore('readwrite', (s) => s.put(rec))) !== null
}

async function loadRegion(region: string): Promise<RegionRecord | null> {
  const rec = await withStore<RegionRecord | undefined>('readonly', (s) => s.get(region))
  return rec ?? null
}

/** 保存してある地域の一覧(新しい順) */
export async function listRegions(): Promise<{ region: string; savedAt: string; version?: string; count: number }[]> {
  const all = (await withStore<RegionRecord[]>('readonly', (s) => s.getAll())) ?? []
  return all
    .map((r) => ({ region: r.region, savedAt: r.savedAt, version: r.version, count: r.maps.length }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export async function deleteRegion(region: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(region))
}

/** 保存してある山頂の地図。なければ null */
export async function loadSummitMap(summit: string): Promise<SummitMap | null> {
  const region = regionOf(summit)
  if (!region) return null
  const rec = await loadRegion(region)
  const code = summit.trim().toUpperCase()
  const raw = rec?.maps.find((m) => (m as { summit?: unknown })?.summit === code)
  return raw ? parseSummitMap(raw) : null
}

/** 地図の保存の状態。saved: 端末にある / pending: まだない(電波があれば取る) / none: その地域の地図がサーバーにない */
export type MapStatus = 'saved' | 'pending' | 'none'

/** 確かめた結果。updated: 取り直して保存した / current: 版が同じ(取り直さない) / ほかは MapStatus */
export type RefreshResult = 'updated' | 'current' | MapStatus

/**
 * 版が取れないとき(古いサーバー・通信の失敗)の保険: 保存からこれ以上たっていたら取り直す。
 * 版が取れていれば、この期限は使わない(版が違えば、すぐ取り直す)
 */
const REFRESH_MS = 30 * 86_400_000

/** 同じ地域の版を、この間隔より短く聞き直さない(地図を開き直すたびに通信しない) */
const RECHECK_MS = 10 * 60_000
const lastChecked = new Map<string, number>()

/** テスト用: 確かめた時刻の記憶を消す */
export function resetRegionChecks(): void {
  lastChecked.clear()
}

/**
 * 1 つの地域を確かめて、サーバーに新しい版があれば取り直して保存する。通信が止まっているときは、通信しない。
 * 版は、地図より先に取る(取る間に更新が入っても、保存した版が古いままなので、次に開いたとき取り直される)。
 * 取り直しに失敗しても、前の記録は消さない。
 */
async function refreshRegion(
  region: string,
  rec: { savedAt: string; version?: string } | undefined,
  store: RegionStore,
  now: number
): Promise<RefreshResult> {
  if (isOffline()) return rec ? 'saved' : 'pending'
  if (rec) {
    const last = lastChecked.get(region)
    if (last !== undefined && now - last < RECHECK_MS) return 'current'
  }
  const version = await store.version(region)
  if (rec && version !== null && rec.version === version) {
    lastChecked.set(region, now)
    return 'current'
  }
  // 版が取れない: 保存から 30 日以内なら、いまのまま使う
  if (rec && version === null && now - Date.parse(rec.savedAt) <= REFRESH_MS) return 'saved'
  const maps = await store.fetch(region)
  if (maps && maps.length > 0 && (await store.save(region, maps, version ?? undefined))) {
    lastChecked.set(region, now)
    return 'updated'
  }
  // サーバーが空を返したら、その地域の地図はない(取り直しても同じ)
  if (maps && maps.length === 0 && !rec) return 'none'
  return rec ? 'saved' : 'pending'
}

/**
 * 山頂の地域の地図を、なければ取って保存し、あればサーバーに新しい版があるときだけ取り直す。
 * 地図を開いたとき・場所を決めたときに裏で呼ぶ(待たない)。通信が止まっていれば、すぐ返る。
 * 山頂の地域が分からなければ null
 */
export async function refreshRegionOf(
  summit: string,
  store: RegionStore = idbStore,
  now = Date.now()
): Promise<RefreshResult | null> {
  const region = regionOf(summit)
  if (!region) return null
  return refreshRegion(region, (await store.get(region)) ?? undefined, store, now)
}

/**
 * 地域(JA/KN など)の地図を、端末にそろえる(予定に入れた山頂は、電波がなくても地図が見えるようにする)。
 * まだない地域と、サーバーに新しい版がある地域を取る。電波がなければ取らない。地域ごとの状態を返す
 */
export async function ensureRegions(
  regions: string[],
  online: boolean,
  store: RegionStore = idbStore,
  now = Date.now()
): Promise<Map<string, MapStatus>> {
  const saved = new Map((await store.list()).map((r) => [r.region, r]))
  const status = new Map<string, MapStatus>()
  for (const region of regions) {
    const rec = saved.get(region)
    const r: RefreshResult = online ? await refreshRegion(region, rec, store, now) : rec ? 'saved' : 'pending'
    status.set(region, r === 'updated' || r === 'current' ? 'saved' : r)
  }
  if (regions.length > 0) await store.persist()
  return status
}

/** ensureRegions・refreshRegionOf が使う保存先と取得先(テストで差し替える) */
export interface RegionStore {
  list: () => Promise<{ region: string; savedAt: string; version?: string }[]>
  get: (region: string) => Promise<{ savedAt: string; version?: string } | null>
  save: (region: string, maps: SummitMap[], version?: string) => Promise<boolean>
  fetch: (region: string) => Promise<SummitMap[] | null>
  version: (region: string) => Promise<string | null>
  persist: () => Promise<void>
}

const idbStore: RegionStore = {
  list: listRegions,
  get: async (region) => {
    const rec = await loadRegion(region)
    return rec ? { savedAt: rec.savedAt, version: rec.version } : null
  },
  save: saveRegion,
  fetch: (region) => fetchRegionMaps(region),
  version: (region) => fetchRegionVersion(region),
  persist: requestPersist,
}

/** 端末の保存を、ブラウザが空き容量の都合で消さないように頼む(断られても動作は変わらない) */
async function requestPersist(): Promise<void> {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.()
  } catch {
    // 頼めない環境では何もしない
  }
}
