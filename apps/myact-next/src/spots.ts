/**
 * スポット(旧版 `refresh_spots`)。`/activation/spots` の応答を、参照(またはコールサイン)ごとの行にまとめる。
 * 旧版は Chart.js の時間軸の折れ線グラフ。新版は、一覧とチャート(SVG。1 行 = 1 つの参照)を、同じデータから作る。
 */
export interface Spot {
  program: string
  reference: string
  activator: string
  frequency: string
  mode: string
  comment: string | null
  spotTime: string
  qsos: number | null
}
export interface SpotGroup {
  key: string
  values: Spot[]
}

export type Program = 'SOTA/POTA' | 'SOTA' | 'POTA'
export const PROGRAMS: Program[] = ['SOTA/POTA', 'SOTA', 'POTA']
export const PERIODS = [1, 3, 6, 9, 12, 15, 18, 21, 24]

/** 表示するプログラム(旧版の target_prog。POTA が先) */
export const targets = (p: Program): string[] => (p === 'SOTA' ? ['SOTA'] : p === 'POTA' ? ['POTA'] : ['POTA', 'SOTA'])

export interface SpotPoint {
  time: Date
  /** 「JA1XYZ JP-0118 7.030 CW コメント」(旧版のツールチップと同じ) */
  label: string
  code: string
  frequency: string
  mode: string
  activator: string
}
export interface SpotRow {
  key: string
  program: string
  points: SpotPoint[]
  /** POTA ログに QSO が(まだ)ない参照。チャートで大きく描く(ハンターの未交信) */
  needed: boolean
  latest: Date
}

export interface SpotQuery {
  hours: number
  byCall: boolean
  /** Hunter のログ ID(あれば、QSO の有無を返してもらう) */
  logId: string | null
}

export function spotsPath({ hours, byCall, logId }: SpotQuery): string {
  const q = new URLSearchParams({ pat_ref: '^(JA|JP-)' })
  if (logId) q.set('log_id', logId)
  q.set(byCall ? 'by_call' : 'by_ref', 'null')
  q.set('hours_ago', String(hours))
  return `/activation/spots?${q}`
}

/** 行にまとめる。行の並びは、旧版と同じ(プログラムの順 → 応答の順)。chart の y は、行の番号 */
export function buildRows(groups: SpotGroup[], program: Program, o: { byCall: boolean; showPotalog: boolean }): SpotRow[] {
  const rows: SpotRow[] = []
  for (const prog of targets(program)) {
    for (const g of groups) {
      const first = g.values[0]
      if (!first || first.program !== prog) continue
      const points = g.values.map((p) => ({
        time: new Date(p.spotTime),
        label: `${p.activator} ${p.reference} ${p.frequency} ${p.mode} ${p.comment ?? ''}`.trimEnd(),
        code: p.reference,
        frequency: p.frequency,
        mode: p.mode,
        activator: p.activator,
      }))
      const needed = !(o.byCall || prog === 'SOTA' || !o.showPotalog || first.qsos != null)
      rows.push({ key: g.key, program: prog, points, needed, latest: new Date(Math.max(...points.map((x) => x.time.getTime()))) })
    }
  }
  return rows
}
