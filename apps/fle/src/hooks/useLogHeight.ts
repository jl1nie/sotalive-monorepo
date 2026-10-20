import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'

/** ログ欄の上に、時刻と運用先を出すのに要る高さ(rem)。時刻と、運用先の2行(n-fer で折り返したとき) */
export const CLOCK_REM = 6.5

/** ログ欄のいちばん低い行数(前の行と、打っている行) */
export const MIN_LINES = 2

/** ログ欄の高さを決めるための寸法(px) */
export interface LogMetrics {
  /** ログ欄とその上(つまみ・時刻と運用先)が使える高さ */
  box: number
  /** つまみの高さ */
  handle: number
  /** 1行の高さ */
  line: number
  /** ログ欄の枠と上下の余白 */
  chrome: number
  /** 時刻と運用先に要る高さ */
  clock: number
}

/**
 * 行数 `lines` のログ欄の上に、時刻と運用先が入るなら、その行数。入らなければ 0(入る限り高く。ログ欄だけにする)。
 * 半端な隙間は作らない(キーボードが出て狭くなったときも、ログ欄だけになる)
 */
export function fitLines(lines: number, m: LogMetrics): number {
  if (lines <= 0) return 0
  const free = m.box - m.handle - (lines * m.line + m.chrome)
  return free >= m.clock ? lines : 0
}

/** つまみをドラッグしたときの行数。`height` は押したときのログ欄の高さ、`dy` は下へ動いた量。`MIN_LINES` 行から */
export function draggedLines(height: number, dy: number, m: LogMetrics): number {
  const want = Math.round((height - dy - m.chrome) / m.line)
  return fitLines(Math.max(MIN_LINES, want), m)
}

/** タップとみなす、指の動きの上限(px) */
const TAP_SLOP = 6

/**
 * つまみのタップで時刻と運用先を出すときの行数。前に使っていた行数 `last`(なければ、時刻と運用先が入る限り多く)。
 * 入らなければ、入る限り多く。2行も入らなければ 0(出せない)
 */
export function openLines(last: number, m: LogMetrics): number {
  const most = Math.floor((m.box - m.handle - m.chrome - m.clock) / m.line)
  if (most < MIN_LINES) return 0
  return last >= MIN_LINES ? Math.min(last, most) : most
}

function measure(ta: HTMLTextAreaElement, handle: HTMLElement, box: number): LogMetrics {
  const style = getComputedStyle(ta)
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  return {
    box,
    handle: handle.offsetHeight,
    line: parseFloat(style.lineHeight) || 26,
    // 上の余白は、下寄せ(alignToBottom)で増えていることがあるので、下と同じとみなす
    chrome: parseFloat(style.paddingBottom) * 2 + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth),
    clock: CLOCK_REM * rem,
  }
}

/**
 * コンパクト・フルキーの、ログ欄の高さ(ログ欄の上の縁のつまみ)。
 * 返す `lines` は、いまのログ欄の行数(0 は入る限り高く)。0 でなければ、空いた上に時刻と運用先を出す
 */
export function useLogHeight({
  enabled,
  saved,
  onSave,
  taRef,
  deps,
}: {
  enabled: boolean
  /** 保存してある行数(0 は入る限り高く) */
  saved: number
  onSave: (lines: number) => void
  taRef: RefObject<HTMLTextAreaElement | null>
  /** 行の高さが変わるもの(文字の種類など) */
  deps: unknown[]
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<LogMetrics | null>(null)
  // ドラッグの間は、離すまで保存しない
  const [dragging, setDragging] = useState<number | null>(null)
  const drag = useRef<{ id: number; y: number; h: number; moved: boolean } | null>(null)
  // タップで閉じる前の行数(開き直すときに戻す)
  const lastOpen = useRef(saved)
  useEffect(() => {
    if (saved > 0) lastOpen.current = saved
  }, [saved])

  const remeasure = () => {
    const ta = taRef.current
    const box = boxRef.current
    const handle = handleRef.current
    if (ta && box && handle) setMetrics(measure(ta, handle, box.clientHeight))
  }
  useLayoutEffect(remeasure, [enabled, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const box = boxRef.current
    if (!enabled || !box || typeof ResizeObserver === 'undefined') return
    // 使える高さが変わったら(画面の向き・OS のキーボード・キーの高さ)、入るかどうかを決め直す
    const observer = new ResizeObserver(remeasure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handle = handleRef.current
    if (!enabled || !handle) return
    // ブラウザ(Safari など)の「引っ張って更新」を、つまみの上でだけ止める(touch-action では止まらない)。
    // ほかの場所から引けば、リロードできる
    const stop = (e: TouchEvent) => e.preventDefault()
    handle.addEventListener('touchmove', stop, { passive: false })
    return () => handle.removeEventListener('touchmove', stop)
  }, [enabled])

  const lines = enabled && metrics ? fitLines(dragging ?? saved, metrics) : 0
  /** ログ欄の高さ(px)。入る限り高くするときは null */
  const height = lines > 0 && metrics ? lines * metrics.line + metrics.chrome : null

  const end = (id: number, tap: boolean) => {
    const d = drag.current
    if (d?.id !== id) return
    drag.current = null
    setDragging(null)
    if (d.moved) {
      if (dragging !== null) onSave(dragging)
      return
    }
    // タップ: 時刻と運用先を出す・しまう(しまうと、入る限り高く)
    if (!tap || !metrics) return
    if (lines > 0) {
      lastOpen.current = lines
      onSave(0)
    } else {
      const open = openLines(lastOpen.current, metrics)
      if (open > 0) onSave(open)
    }
  }
  const handleProps = {
    ref: handleRef,
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      const ta = taRef.current
      if (!ta) return
      e.preventDefault()
      e.currentTarget.setPointerCapture?.(e.pointerId)
      drag.current = { id: e.pointerId, y: e.clientY, h: ta.offsetHeight, moved: false }
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      const ta = taRef.current
      const box = boxRef.current
      if (!d || d.id !== e.pointerId || !ta || !box) return
      if (!d.moved && Math.abs(e.clientY - d.y) < TAP_SLOP) return
      d.moved = true
      setDragging(draggedLines(d.h, e.clientY - d.y, measure(ta, e.currentTarget, box.clientHeight)))
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => end(e.pointerId, true),
    onPointerCancel: (e: PointerEvent<HTMLDivElement>) => end(e.pointerId, false),
  }

  return { boxRef, handleProps, lines, height }
}
