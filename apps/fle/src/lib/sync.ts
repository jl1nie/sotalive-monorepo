// 設定と予定を、端末をまたいで同期する(サーバーは pages/fle/functions/api/fle/prefs。Cloudflare KV)。
//
// アカウントはない。端末が、推測できない同期コードを作り、QR か文字で、ほかの端末に渡す。
// 端末の中の設定・予定が主で、同期は、つながっているときだけ。サーバーとは、版(updatedAt)で食い違いを見つけ、
// 食い違ったら、設定は項目ごとに3者で、予定は1件ごとに新しいほうを残して、マージする。

import type { Settings } from '@/hooks/useSettings'
import { netFetch } from '@/lib/net'
import { mergePlans, type PlanRecord } from '@/lib/plans'

/** 端末をまたいで同じにする設定(テーマ・数字キーの行は、端末ごとに違うので除く) */
export const SYNCED_KEYS = ['rigs', 'timezone', 'writeBandMode', 'writeRst', 'language', 'hamlog', 'hamlogZone'] as const
export type SyncedSettings = Pick<Settings, (typeof SYNCED_KEYS)[number]>

/** 同期する内容 */
export interface SyncDoc {
  settings: SyncedSettings
  plans: PlanRecord[]
}

// ---- 同期コード ----

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const CODE_LENGTH = 26

/** 同期コード: 26文字(130ビット)の、推測できないランダムな文字列 */
export function generateCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(CODE_LENGTH), (b) => CODE_CHARS[b % 32]).join('')
}

export const isCode = (s: string): boolean => /^[A-Z2-7]{26}$/.test(s)

/** QR に入れる URL。`#` 以降は、サーバーに送られない(ログに、コードが残らない) */
export function syncUrl(code: string, origin: string = location.origin): string {
  return `${origin}/fle/#sync=${code}`
}

/**
 * 読み取った文字・貼り付けた文字から、同期コードを取り出す。URL(`…#sync=コード`)でも、コードだけでもよい。
 * 小文字・空白・ハイフンは許す(手で写すとき)。違えば null。
 */
export function codeFromText(text: string): string | null {
  const fromUrl = /[#&]sync=([A-Za-z2-7-\s]+)/.exec(text)?.[1]
  const code = (fromUrl ?? text).replace(/[\s-]/g, '').toUpperCase()
  return isCode(code) ? code : null
}

/** 読みやすいように、4文字ずつ区切る */
export const formatCode = (code: string): string => code.match(/.{1,4}/g)?.join(' ') ?? code

// ---- 設定・内容のマージ ----

export function pickSettings(s: Settings): SyncedSettings {
  return {
    rigs: s.rigs,
    timezone: s.timezone,
    writeBandMode: s.writeBandMode,
    writeRst: s.writeRst,
    language: s.language,
    hamlog: s.hamlog,
    hamlogZone: s.hamlogZone,
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * 設定の3者マージ: 端末で変えていない項目(最後に同期した内容と同じ)は、サーバーのもの。
 * 端末で変えた項目は、端末のもの(別の端末で、別の項目を変えても、両方残る)。
 */
export function mergeSettings(local: SyncedSettings, snapshot: SyncedSettings | null, remote: Partial<SyncedSettings>): SyncedSettings {
  const out: Record<string, unknown> = { ...local }
  for (const key of SYNCED_KEYS) {
    const changedHere = snapshot !== null && !same(local[key], snapshot[key])
    if (!changedHere && key in remote) out[key] = remote[key]
  }
  return out as unknown as SyncedSettings
}

export function mergeDocs(local: SyncDoc, snapshot: SyncDoc | null, remote: SyncDoc, now = Date.now()): SyncDoc {
  return {
    settings: mergeSettings(local.settings, snapshot?.settings ?? null, remote.settings),
    plans: mergePlans(local.plans, remote.plans, now),
  }
}

export const sameDoc = (a: SyncDoc, b: SyncDoc): boolean => same(a, b)

// ---- サーバーとのやりとり ----

export class SyncError extends Error {
  /** unavailable: サーバーに同期の用意がない(503)。network: つながらない。invalid: 応答が想定外 */
  readonly kind: 'unavailable' | 'network' | 'invalid'

  constructor(kind: 'unavailable' | 'network' | 'invalid') {
    super(kind)
    this.kind = kind
  }
}

export interface Remote {
  updatedAt: number
  data: SyncDoc
}

type Fetch = typeof fetch
const endpoint = (code: string) => `/api/fle/prefs/${code}`

/** `force`: 利用者が押した操作(通信が止まっていると覚えていても、試す) */
async function request(fetchImpl: Fetch, code: string, init?: RequestInit, force = false): Promise<Response> {
  try {
    return await netFetch(endpoint(code), init, { fetchImpl, force })
  } catch {
    throw new SyncError('network')
  }
}

/** サーバーの内容を取る。まだなければ null */
export async function pull(code: string, fetchImpl: Fetch = fetch, force = false): Promise<Remote | null> {
  const res = await request(fetchImpl, code, undefined, force)
  if (res.status === 404) return null
  if (res.status === 503) throw new SyncError('unavailable')
  if (!res.ok) throw new SyncError('invalid')
  return readRemote(await res.json())
}

function readRemote(body: unknown): Remote {
  const b = body as Partial<Remote> | null
  if (!b || typeof b.updatedAt !== 'number' || !b.data) throw new SyncError('invalid')
  return { updatedAt: b.updatedAt, data: { settings: b.data.settings ?? ({} as SyncedSettings), plans: b.data.plans ?? [] } }
}

export type PushResult = { ok: true; updatedAt: number } | { ok: false; remote: Remote }

/** サーバーに送る。`base` は、最後に見たサーバーの版(なければ 0)。ほかの端末が先に保存していたら、そのサーバーの内容を返す */
export async function push(code: string, base: number, doc: SyncDoc, fetchImpl: Fetch = fetch, force = false): Promise<PushResult> {
  const res = await request(
    fetchImpl,
    code,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base, data: doc }),
    },
    force
  )
  if (res.status === 409) return { ok: false, remote: readRemote(await res.json()) }
  if (res.status === 503) throw new SyncError('unavailable')
  if (!res.ok) throw new SyncError('invalid')
  const body = (await res.json()) as { updatedAt?: number }
  if (typeof body.updatedAt !== 'number') throw new SyncError('invalid')
  return { ok: true, updatedAt: body.updatedAt }
}

/** サーバーの設定・予定を消す */
export async function removeRemote(code: string, fetchImpl: Fetch = fetch, force = false): Promise<void> {
  const res = await request(fetchImpl, code, { method: 'DELETE' }, force)
  if (!res.ok) throw new SyncError(res.status === 503 ? 'unavailable' : 'invalid')
}

// ---- 同期の1回分 ----

/** 端末に覚えておく、同期の状態 */
export interface SyncState {
  code: string
  /** 最後に見たサーバーの版 */
  base: number
  /** 最後に同期した内容(設定の3者マージの基準) */
  snapshot: SyncDoc
}

/**
 * 1回の同期: サーバーの内容を取り、マージして、違えば送る。食い違えば(別の端末が先に保存)やり直す。
 * `merged` は、端末に反映する内容。
 */
export async function syncOnce(
  state: SyncState,
  local: SyncDoc,
  fetchImpl: Fetch = fetch,
  now = Date.now(),
  force = false
): Promise<{ state: SyncState; merged: SyncDoc }> {
  let remote = await pull(state.code, fetchImpl, force)
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!remote) {
      const sent = await push(state.code, 0, local, fetchImpl, force)
      if (sent.ok) return { state: { ...state, base: sent.updatedAt, snapshot: local }, merged: local }
      remote = sent.remote
      continue
    }
    const merged = mergeDocs(local, state.snapshot, remote.data, now)
    if (sameDoc(merged, remote.data)) {
      return { state: { ...state, base: remote.updatedAt, snapshot: merged }, merged }
    }
    const sent = await push(state.code, remote.updatedAt, merged, fetchImpl, force)
    if (sent.ok) return { state: { ...state, base: sent.updatedAt, snapshot: merged }, merged }
    remote = sent.remote
    local = merged
  }
  throw new SyncError('invalid')
}

/**
 * 同期コードに参加する: サーバーに内容があれば、設定はサーバーのもので置き換え、予定は端末のものと合わせる
 * (端末の予定を失わない)。なければ、端末の内容を送る。
 */
export async function join(
  code: string,
  local: SyncDoc,
  fetchImpl: Fetch = fetch,
  now = Date.now(),
  force = false
): Promise<{ state: SyncState; merged: SyncDoc }> {
  // 基準を、端末の内容にする: 端末の設定は「変えていない」扱いになり、サーバーにある設定が採用される。
  // 予定は、端末のものと合わせる。サーバーに何もなければ、端末の内容を送る
  return syncOnce({ code, base: 0, snapshot: local }, local, fetchImpl, now, force)
}

// ---- 端末への保存 ----

const STATE_KEY = 'fle.sync'

export function loadSyncState(): SyncState | null {
  try {
    const v = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null')
    return v && typeof v.code === 'string' && isCode(v.code) && typeof v.base === 'number' && v.snapshot ? (v as SyncState) : null
  } catch {
    return null
  }
}

export function saveSyncState(state: SyncState | null): void {
  try {
    if (state) localStorage.setItem(STATE_KEY, JSON.stringify(state))
    else localStorage.removeItem(STATE_KEY)
  } catch {
    // 保存できなければ、次の同期で、やり直す
  }
}
