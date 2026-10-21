import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** ログ欄の上に、時刻と運用先を出す高さ(rem)。時刻と、運用先の2行(n-fer で折り返したとき) */
export const CLOCK_REM = 6.5

/** ログ欄に残す、いちばん少ない行数(前の行と、打っている行) */
export const MIN_LINES = 2

/** 時刻と運用先が入るかを決めるための寸法(px) */
export interface LogMetrics {
  /** ログ欄とその上(時刻と運用先)が使える高さ */
  box: number
  /** 1行の高さ */
  line: number
  /** ログ欄の枠と上下の余白 */
  chrome: number
  /** 時刻と運用先の高さ */
  clock: number
}

/**
 * ログ欄の上に時刻と運用先を出しても、ログ欄に `MIN_LINES` 行が残るか。
 * 残らなければ出さない(OS のキーボードが出て狭くなったときなど。ログ欄だけにする)
 */
export function clockFits(m: LogMetrics): boolean {
  return m.box - m.clock >= MIN_LINES * m.line + m.chrome
}

function measure(ta: HTMLTextAreaElement, box: number): LogMetrics {
  const style = getComputedStyle(ta)
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  return {
    box,
    line: parseFloat(style.lineHeight) || 26,
    // 上の余白は、下寄せ(alignToBottom)で増えていることがあるので、下と同じとみなす
    chrome: parseFloat(style.paddingBottom) * 2 + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth),
    clock: CLOCK_REM * rem,
  }
}

/**
 * フルキーの、ログ欄の上に時刻と運用先を出す場所があるか。使える高さが変わったら(画面の向き・OS のキーボード・
 * キーの高さ)、決め直す。`boxRef` は、ログ欄と時刻と運用先を入れる箱
 */
export function useClockRoom({
  enabled,
  taRef,
  deps,
}: {
  enabled: boolean
  taRef: RefObject<HTMLTextAreaElement | null>
  /** 行の高さが変わるもの(文字の種類など) */
  deps: unknown[]
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<LogMetrics | null>(null)

  const remeasure = () => {
    const ta = taRef.current
    const box = boxRef.current
    if (ta && box) setMetrics(measure(ta, box.clientHeight))
  }
  useLayoutEffect(remeasure, [enabled, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const box = boxRef.current
    if (!enabled || !box || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(remeasure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return { boxRef, fits: enabled && metrics !== null && clockFits(metrics) }
}
