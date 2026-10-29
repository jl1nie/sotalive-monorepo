// 運用の予定(行き先)。行く前に PC で登録しておき、山で選んで、ログの先頭の行として書き込む。
// 端末をまたいで同期する(`sync.ts`)ので、1件ごとに更新時刻を持ち、消したものは印(Tombstone)として残す。

export interface Plan {
  id: string
  /** 名前(例: 高尾山 10/25) */
  title: string
  /** 運用の日(`YYYY-MM-DD`)。なければ空 */
  date: string
  mycall: string
  sota: string
  pota: string[]
  wwff: string
  grid: string
  /** HAMLOG の Rig= の右辺(任意) */
  rig: string
  /** QSLメッセージ(任意。`$rig` などを含められる) */
  qslmsg: string
  /** メモ(任意。JCC・JCG など。ログに `#` の行で書く)。前の版で作った予定にはない */
  memo?: string
  /** 最後に変えた時刻(ms) */
  updatedAt: number
}

/** 消した予定の印。ほかの端末に「消した」ことを伝えるために、しばらく残す */
export interface Tombstone {
  id: string
  updatedAt: number
  deleted: true
}

export type PlanRecord = Plan | Tombstone

export const MAX_PLANS = 50
/** 1 つの予定に並べられる POTA の公園の数(同期するサーバーの上限と同じ) */
export const MAX_PLAN_POTA = 10
/** 消した印を残す期間(ms)。ほかの端末が、これより長く同期しないと、消した予定が戻ることがある */
const TOMBSTONE_TTL = 90 * 24 * 60 * 60 * 1000
/** 残す消した印の数(新しい順。同期するサーバーの上限と同じ) */
export const MAX_TOMBSTONES = 200

export const isDeleted = (r: PlanRecord): r is Tombstone => 'deleted' in r && r.deleted === true

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** 予定の番号(端末で作る。重ならない長さのランダムな12文字) */
export function newPlanId(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(12), (b) => ID_CHARS[b % ID_CHARS.length]).join('')
}

export function emptyPlan(id: string, now: number, mycall = ''): Plan {
  return { id, title: '', date: '', mycall, sota: '', pota: [], wwff: '', grid: '', rig: '', qslmsg: '', memo: '', updatedAt: now }
}

/** 同じ番号は、更新時刻の新しいほう(同じなら、サーバーのほう)を残す。古い消した印は捨てる */
export function mergePlans(local: PlanRecord[], remote: PlanRecord[], now = Date.now()): PlanRecord[] {
  const byId = new Map<string, PlanRecord>()
  for (const r of remote) byId.set(r.id, r)
  for (const l of local) {
    const r = byId.get(l.id)
    if (!r || l.updatedAt > r.updatedAt) byId.set(l.id, l)
  }
  const kept = [...byId.values()].filter((r) => !isDeleted(r) || now - r.updatedAt < TOMBSTONE_TTL)
  const newest = new Set(
    kept
      .filter(isDeleted)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_TOMBSTONES)
      .map((r) => r.id),
  )
  return kept.filter((r) => !isDeleted(r) || newest.has(r.id)).sort((a, b) => a.id.localeCompare(b.id))
}

/** 消していない予定 */
export const livePlans = (records: PlanRecord[]): Plan[] => records.filter((r): r is Plan => !isDeleted(r))

/**
 * 並べ方: 今日以降の日付(近い順)→ 日付のないもの(新しく変えた順)→ 過ぎた日付(新しい順)。
 * 山で開いたとき、今日・直近の予定が先頭に来るように。
 */
export function sortPlans(plans: Plan[], today: string): Plan[] {
  const rank = (p: Plan) => (p.date === '' ? 1 : p.date >= today ? 0 : 2)
  return [...plans].sort((a, b) => {
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    if (rank(a) === 0) return a.date.localeCompare(b.date)
    if (rank(a) === 2) return b.date.localeCompare(a.date)
    return b.updatedAt - a.updatedAt
  })
}

/** 一覧に出す1行(名前がなければ、行き先から) */
export function planLabel(p: Plan): string {
  const place = [p.sota, ...p.pota, p.wwff].filter(Boolean).join(' ')
  return p.title.trim() || place || p.mycall || p.id
}
