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

/** 保存してあればそれを、なければ(オンラインなら)取ってから返す */
export async function getSummitMap(summit: string, online: boolean): Promise<SummitMap | null> {
  const saved = await loadSummitMap(summit)
  if (saved || !online) return saved
  return (await downloadRegionOf(summit)) ? loadSummitMap(summit) : null
}
