// WSPRnet のスポット検索結果(画面からコピーしたもの)を読む。
// 見出し・件数・フッターなどの余計な行が混ざっていてもよい(サーバーと同じく、13項目の行だけを読む)。

export interface Spot {
  /** UTC。`YYYY-MM-DD HH:MM` */
  time: string
  call: string
  snr: number
  reporter: string
  km: number
}

export interface Analysis {
  spots: Spot[]
  /** スポットのある時刻(重複なし・昇順) */
  times: string[]
}

const TIME = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^\d{2}:\d{2}$/

/** 13項目(日付 時刻 コール MHz SNR ドリフト グリッド 電力 レポータ レポータのグリッド km 方位 モード)の行を読む */
export function analyze(text: string): Analysis {
  const spots: Spot[] = []
  for (const line of text.split('\n')) {
    const cols = line.trim().split(/\s+/)
    if (cols.length !== 13 || !TIME.test(cols[0]) || !HHMM.test(cols[1])) continue
    spots.push({
      time: `${cols[0]} ${cols[1]}`,
      call: cols[2],
      snr: Number.parseInt(cols[4], 10) || 0,
      reporter: cols[8],
      km: Number.parseInt(cols[10], 10) || 0,
    })
  }
  const times = [...new Set(spots.map((s) => s.time))].sort()
  return { spots, times }
}

export interface Plot {
  label: string
  color: string
  from: string
  to: string
  /** グラフに描くか */
  enabled: boolean
}

/** 系列の色(サーバーが解釈する名前)。既定の並びは、旧画面と同じ */
export const COLORS = [
  { value: 'red', label: 'Red' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'cyan', label: 'Cyan' },
] as const

/** 系列の数(旧画面と同じ4つ) */
export const PLOT_ROWS = COLORS.length

/** 何も選んでいない系列(色は、行ごとに違う既定) */
export function emptyPlots(): Plot[] {
  return COLORS.map((c) => ({ label: '', color: c.value, from: '', to: '', enabled: false }))
}

/** 解析した直後: 各系列の開始・終了を、スポットのある最初と最後の時刻にする(選んだ値は、残す) */
export function withTimes(plots: Plot[], a: Analysis): Plot[] {
  if (a.times.length === 0) return plots.map((p) => ({ ...p, from: '', to: '' }))
  const first = a.times[0]
  const last = a.times[a.times.length - 1]
  return plots.map((p) => ({
    ...p,
    from: a.times.includes(p.from) ? p.from : first,
    to: a.times.includes(p.to) ? p.to : last,
  }))
}

/** 読めた行だけを、項目を1つの空白で区切って並べ直す(貼り付けに混ざった余計な行・空白を除く) */
export function cleanSpots(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c.length === 13 && TIME.test(c[0]) && HHMM.test(c[1]))
    .map((c) => c.join(' '))
    .join('\n')
}

export interface DrawOptions {
  title: string
  minKm: number
  maxKm: number
  annotation: boolean
  width?: number
}

/** サーバー(`/api/v2/wspr/svg`)に送る JSON */
export function buildRequest(text: string, plots: Plot[], o: DrawOptions) {
  return {
    title: o.title,
    plots: plots
      .filter((p) => p.enabled)
      .map((p) => ({ label: p.label, color: p.color, from: p.from, to: p.to })),
    spots: text,
    min: o.minKm,
    max: o.maxKm,
    label: o.annotation,
    width: o.width ?? 800,
  }
}

/** 期間の誤り(なければ null) */
export function checkPlots(plots: Plot[]): string | null {
  const used = plots.filter((p) => p.enabled)
  if (used.length === 0) return '描く系列を1つ以上選んでください'
  for (const p of used) {
    if (!p.from || !p.to || p.from > p.to) return `「${p.label || '(名前なし)'}」の開始が終了より後になっています`
  }
  return null
}
