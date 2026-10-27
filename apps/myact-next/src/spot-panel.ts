/**
 * スポットの面(docs/myact-next-design.md の案 A): PC は地図の右の側パネル、スマホは下からのシート。
 * 一覧(新しい順)とチャート(1 行 = 1 つの参照。横軸は時刻)。押すと、その参照の場所へ動く。開いている間、60 秒ごとに取り直す。
 * SOTA のスポットは、提供元の旧 API が廃止されたため、案内だけ(取得できるようになったら SOTA_SPOTS_AVAILABLE を true に)。
 */
import { h } from './dom.ts'
import type { Api } from './api.ts'
import type { PrefsStore } from './prefs.ts'
import { PERIODS, PROGRAMS, buildRows, spotsPath, targets, type Program, type SpotRow } from './spots.ts'

export const SOTA_SPOTS_AVAILABLE = false
export const REFRESH_MS = 60_000

const NS = 'http://www.w3.org/2000/svg'
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ...children: (Node | string)[]) => {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  el.append(...children)
  return el
}
const pad2 = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
const mdhm = (d: Date) => `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${hhmm(d)}`

export interface SpotPanelOptions {
  api: Api
  prefs: PrefsStore
  /** 参照のコードを押したとき(場所へ動く) */
  onPick: (code: string) => void
  now?: () => Date
  /** 開閉したとき(ボタンの aria-expanded などを合わせる) */
  onChange?: (open: boolean) => void
}

export function createSpotPanel({ api, prefs, onPick, now = () => new Date(), onChange }: SpotPanelOptions) {
  let program: Program = 'SOTA/POTA'
  let timer: ReturnType<typeof setInterval> | undefined
  let controller: AbortController | null = null

  const progSelect = h('select', { id: 'spot-program', class: 'custom-select custom-select-sm', 'aria-label': 'プログラム', 'on:change': () => { program = progSelect.value as Program; void refresh() } },
    ...PROGRAMS.map((p) => h('option', { value: p, selected: p === program }, p)))
  const periodSelect = h('select', { id: 'spot-period', class: 'custom-select custom-select-sm', 'aria-label': '期間(時間)', 'on:change': () => { prefs.set({ spot_period: Number(periodSelect.value) }); void refresh() } },
    ...PERIODS.map((n) => h('option', { value: n }, `${n} 時間`)))
  const byCall = h('input', { type: 'checkbox', id: 'spot-bycall', 'on:change': () => { prefs.set({ by_call: byCall.checked }); void refresh() } })
  const notice = h('div', { class: 'alert alert-warning small m-0 py-1 px-3 rounded-0', role: 'status', hidden: true },
    'SOTA のスポットは、現在取得できません(提供元の旧 API が廃止されたため)。POTA のスポットのみ表示します。')
  const empty = h('div', { class: 'text-center text-muted small py-2', role: 'status', hidden: true }, '現在、表示できるスポットはありません。')
  const failed = h('div', { class: 'alert alert-danger small m-0 py-1 px-3 rounded-0', role: 'alert', hidden: true }, 'スポットを取得できませんでした。しばらくして、もう一度開いてください。')
  const chart = h('div', { class: 'spot-chart' })
  const list = h('div', { class: 'spot-list' })

  const root = h('aside', { id: 'spot-panel', class: 'spot-panel', 'aria-label': 'スポット', hidden: true },
    h('div', { class: 'spot-grip', 'aria-hidden': 'true' }),
    h('div', { class: 'spot-head' },
      h('b', {}, 'スポット'),
      progSelect, periodSelect,
      h('label', { class: 'spot-bycall' }, byCall, ' コールサイン別'),
      h('button', { type: 'button', class: 'pl-close', 'aria-label': 'スポットを閉じる', 'on:click': () => close() }, '×'),
    ),
    notice, failed, empty, chart, list,
  )

  function drawChart(rows: SpotRow[]) {
    const hours = prefs.get().spot_period
    const to = now().getTime() + 300_000
    const from = now().getTime() - hours * 3_600_000
    const left = 8, right = 12, top = 6, rowH = 22, axisH = 22
    const W = 360
    const H = top + Math.max(rows.length, 1) * rowH + axisH
    const x = (t: number) => left + ((t - from) / (to - from)) * (W - left - right)
    const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': `スポットのチャート(${rows.length} 件)`, class: 'spot-svg' })
    // 横軸: 目盛りは 5 本ほど(正時に揃える)
    const step = Math.max(1, Math.ceil(hours / 5)) * 3_600_000
    for (let t = Math.ceil(from / step) * step; t <= to; t += step) {
      el.append(svg('line', { x1: x(t), x2: x(t), y1: top, y2: H - axisH, stroke: '#dee2e6' }))
      el.append(svg('text', { x: x(t), y: H - 7, 'text-anchor': 'middle', 'font-size': 9, fill: '#6c757d' }, hours > 12 ? mdhm(new Date(t)) : hhmm(new Date(t))))
    }
    el.append(svg('line', { x1: left, x2: W - right, y1: H - axisH, y2: H - axisH, stroke: '#adb5bd' }))
    rows.forEach((r, i) => {
      const y = top + i * rowH + rowH / 2
      for (const p of r.points) {
        const c = svg('circle', { cx: x(p.time.getTime()), cy: y, r: r.needed ? 8 : 5, fill: r.program === 'POTA' ? '#2e7d32' : '#ef6c00', 'fill-opacity': 0.8, class: 'spot-dot', tabindex: 0, role: 'button' }, svg('title', {}, `${r.key} — ${p.label}(${hhmm(p.time)})`))
        if (r.needed) { c.setAttribute('stroke', '#ffa000'); c.setAttribute('stroke-width', '3') }
        const pick = () => onPick(p.code)
        c.addEventListener('click', pick)
        c.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') pick() })
        el.append(c)
      }
    })
    chart.replaceChildren(el)
  }

  function drawList(rows: SpotRow[]) {
    const sorted = [...rows].sort((a, b) => b.latest.getTime() - a.latest.getTime())
    list.replaceChildren(...sorted.map((r) => {
      const last = r.points.reduce((a, b) => (b.time > a.time ? b : a))
      return h('button', { type: 'button', class: `spot-row${r.needed ? ' spot-needed' : ''}`, 'on:click': () => onPick(last.code) },
        h('span', { class: 'spot-main' }, h('b', {}, last.activator), h('span', { class: 'spot-ref' }, r.key)),
        h('span', { class: 'spot-meta' }, `${last.frequency} ${last.mode}`, h('br'), hhmm(r.latest)),
      )
    }))
  }

  async function refresh() {
    const p = prefs.get()
    periodSelect.value = String(p.spot_period)
    byCall.checked = p.by_call
    notice.hidden = SOTA_SPOTS_AVAILABLE || !targets(program).includes('SOTA')
    controller?.abort()
    controller = new AbortController()
    const res = await api.spots(spotsPath({ hours: p.spot_period, byCall: p.by_call, logId: p.pota_hunter_uuid }), controller.signal)
    if (controller.signal.aborted) return
    failed.hidden = res !== null
    const rows = buildRows(res ?? [], program, { byCall: p.by_call, showPotalog: p.show_potalog })
    empty.hidden = rows.length > 0 || res === null
    drawChart(rows)
    drawList(rows)
  }

  function open() {
    root.hidden = false
    onChange?.(true)
    void refresh()
    clearInterval(timer)
    timer = setInterval(() => void refresh(), REFRESH_MS)
  }
  function close() {
    root.hidden = true
    onChange?.(false)
    clearInterval(timer)
    controller?.abort()
  }
  return { element: root, open, close, toggle: () => (root.hidden ? open() : close()), isOpen: () => !root.hidden }
}
export type SpotPanel = ReturnType<typeof createSpotPanel>
