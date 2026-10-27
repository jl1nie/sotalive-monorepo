/**
 * 設定。保存先は、旧版と同じ Cookie(同じ名前・同じ値の形)。
 * - 真偽: 'true' / 'false'(Cookie がなければ、既定の値)
 * - POTA ログの UUID: 文字列。登録していないときは null(Cookie がない・''・'null'・'undefined' はどれも null。保存するときは 'null')
 * 段階 1 以降、設定が増えたら、ここに足す(旧版の約 35 項目)。
 */
export interface Prefs {
  /** 地図とポップアップに、POTA ログを反映する */
  show_potalog: boolean
  /** どのログを使うか: true = Activator、false = Hunter */
  show_potaactlog: boolean
  pota_activator_uuid: string | null
  pota_hunter_uuid: string | null
  /** 公園名を、いつも表示する */
  popup_permanent: boolean
  /** ポップアップに、マップコードのリンクを出す */
  display_mapcode: boolean
  /** 位置のリンクを、Google マップにする(false = 地理院地図) */
  link_googlemap: boolean
  /** SOTA の山を出す */
  sota_ref: boolean
  /** ポップアップの見出しに、POTA の参照を出す */
  pota_ref: boolean
  /** ポップアップの見出しに、JAFF の参照を出す */
  jaff_ref: boolean
  /** この拡大(ズーム)以上では、全ての公園・山を出す(7〜12) */
  zoom_threshold: number
}

export const DEFAULTS: Prefs = {
  show_potalog: false,
  show_potaactlog: true,
  pota_activator_uuid: null,
  pota_hunter_uuid: null,
  popup_permanent: true,
  display_mapcode: false,
  link_googlemap: false,
  sota_ref: true,
  pota_ref: true,
  jaff_ref: true,
  zoom_threshold: 12,
}

/** Cookie の入出力(テストでは、差し替える) */
export interface CookieIO {
  get(name: string): string | undefined
  set(name: string, value: string): void
}

const BOOLEANS = ['show_potalog', 'show_potaactlog', 'popup_permanent', 'display_mapcode', 'link_googlemap', 'sota_ref', 'pota_ref', 'jaff_ref'] as const
const UUIDS = ['pota_activator_uuid', 'pota_hunter_uuid'] as const

export function parseUuid(v: string | undefined): string | null {
  return v === undefined || v === '' || v === 'null' || v === 'undefined' ? null : v
}

export function loadPrefs(io: CookieIO): Prefs {
  const prefs = { ...DEFAULTS }
  for (const k of BOOLEANS) {
    const v = io.get(k)
    if (v !== undefined) prefs[k] = v === 'true'
  }
  for (const k of UUIDS) prefs[k] = parseUuid(io.get(k))
  const zt = Number(io.get('zoom_threshold'))
  if (io.get('zoom_threshold') !== undefined && Number.isFinite(zt)) prefs.zoom_threshold = zt
  return prefs
}

export function savePref<K extends keyof Prefs>(io: CookieIO, key: K, value: Prefs[K]): void {
  io.set(key, value === null ? 'null' : String(value))
}

/** 変更を通知できる、設定の入れ物 */
export function createPrefs(io: CookieIO) {
  let prefs = loadPrefs(io)
  const listeners = new Set<(p: Prefs) => void>()
  return {
    get: (): Prefs => prefs,
    set(patch: Partial<Prefs>): void {
      prefs = { ...prefs, ...patch }
      for (const k of Object.keys(patch) as (keyof Prefs)[]) savePref(io, k, prefs[k])
      for (const l of listeners) l(prefs)
    },
    subscribe(l: (p: Prefs) => void): () => void {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    /** 地図・ポップアップの取得に付ける log_id(旧版の getLogID)。ログを出さない設定、または UUID がなければ null */
    logId(): string | null {
      if (!prefs.show_potalog) return null
      return (prefs.show_potaactlog ? prefs.pota_activator_uuid : prefs.pota_hunter_uuid) ?? null
    },
  }
}

export type PrefsStore = ReturnType<typeof createPrefs>
