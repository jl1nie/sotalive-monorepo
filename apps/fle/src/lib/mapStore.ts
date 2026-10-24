/**
 * 簡易地図の保存(IndexedDB)。地域(JA/KN など)ごとに、その地域の全山頂の地図をまとめて持つ。
 * 地域ひとつで 1 MB ほどあるので、localStorage(ログの保存先)には置かない。
 * 保存先が使えない(プライベートモード等)ときは、保存しないだけで画面は止めない。
 */
import { fetchRegionMaps, parseSummitMap, regionOf, type SummitMap } from '@/lib/summitMap'

const DB_NAME = 'fle-maps'
const STORE = 'regions'

interface RegionRecord {
  region: string
  /** 保存した時刻(ISO 8601) */
  savedAt: string
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
export async function saveRegion(region: string, maps: SummitMap[]): Promise<boolean> {
  const rec: RegionRecord = { region, savedAt: new Date().toISOString(), maps }
  return (await withStore('readwrite', (s) => s.put(rec))) !== null
}

async function loadRegion(region: string): Promise<RegionRecord | null> {
  const rec = await withStore<RegionRecord | undefined>('readonly', (s) => s.get(region))
  return rec ?? null
}

/** 保存してある地域の一覧(新しい順) */
export async function listRegions(): Promise<{ region: string; savedAt: string; count: number }[]> {
  const all = (await withStore<RegionRecord[]>('readonly', (s) => s.getAll())) ?? []
  return all
    .map((r) => ({ region: r.region, savedAt: r.savedAt, count: r.maps.length }))
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

/**
 * 山頂の地域の地図を取って保存する(オンラインのとき)。取れた地域の山頂の数を返す。取れなければ null。
 * 場所を決めたときに裏で呼び、山頂に着く前に端末へ入れておく
 */
export async function downloadRegionOf(summit: string): Promise<number | null> {
  const region = regionOf(summit)
  if (!region) return null
  const maps = await fetchRegionMaps(region)
  if (!maps || maps.length === 0) return null
  return (await saveRegion(region, maps)) ? maps.length : null
}

/** 地図の保存の状態。saved: 端末にある / pending: まだない(電波があれば取る) / none: その地域の地図がサーバーにない */
export type MapStatus = 'saved' | 'pending' | 'none'

/** 保存し直す間隔(公園区域などのデータを直したとき、古い地図を使い続けないように) */
const REFRESH_MS = 30 * 86_400_000

/**
 * 地域(JA/KN など)の地図を、端末にそろえる(予定に入れた山頂は、電波がなくても地図が見えるようにする)。
 * まだない地域と、古くなった地域を取る。電波がなければ取らない。地域ごとの状態を返す
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
    const stale = !rec || now - Date.parse(rec.savedAt) > REFRESH_MS
    if (stale && online) {
      const maps = await store.fetch(region)
      if (maps && maps.length > 0 && (await store.save(region, maps))) {
        status.set(region, 'saved')
        continue
      }
      // サーバーが空を返したら、その地域の地図はない(取り直しても同じ)
      if (maps && maps.length === 0 && !rec) {
        status.set(region, 'none')
        continue
      }
    }
    status.set(region, rec ? 'saved' : 'pending')
  }
  if (regions.length > 0) await store.persist()
  return status
}

/** ensureRegions が使う保存先と取得先(テストで差し替える) */
export interface RegionStore {
  list: () => Promise<{ region: string; savedAt: string }[]>
  save: (region: string, maps: SummitMap[]) => Promise<boolean>
  fetch: (region: string) => Promise<SummitMap[] | null>
  persist: () => Promise<void>
}

const idbStore: RegionStore = {
  list: listRegions,
  save: saveRegion,
  fetch: (region) => fetchRegionMaps(region),
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
