import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** ログ欄の上に、時刻と運用先を出す高さ(rem)。時刻と、運用先の2行(n-fer で折り返したとき) */
export const CLOCK_REM = 6.25

/** 情報窓の中身の寸法(rem)。`StationClock` が使い、余白の計算(`clockMarginRem`)とそろえる */
export const CLOCK_TIME_REM = 2.25 // 時刻の文字(行の高さは文字と同じ)
export const CLOCK_ROW_REM = 1.25 // 運用先・メモの文字
export const CLOCK_LINE = 1.1 // 運用先・メモの行の高さ(文字に対する倍率)
export const CLOCK_GAP_REM = 0.2 // 行の間
export const CLOCK_PAD_REM = 0.5 // 下の余白(ログ窓との間)。候補バーとキーボードの間(gap-2)と同じ

/**
 * 情報窓の下とログ窓の間の余白(rem)。中身(`rows` 行: 時刻、運用先、メモ)は、下の余白を除いた高さの中央に
 * 寄るので、余白 = 下の padding + 余りの半分。文字は倍率 `scale` で変わり、行の間と padding は変わらない。
 * 負なら、中身が入りきらず、はみ出して切れる
 */
export function clockMarginRem(rows: 1 | 2 | 3, scale: number): number {
  const content = scale * (CLOCK_TIME_REM + (rows - 1) * CLOCK_ROW_REM * CLOCK_LINE) + (rows - 1) * CLOCK_GAP_REM
  return CLOCK_PAD_REM + (CLOCK_REM * scale - CLOCK_PAD_REM - content) / 2
}

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

function measure(ta: HTMLTextAreaElement, boxEl: HTMLElement): LogMetrics {
  const style = getComputedStyle(ta)
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  // 文字の大きさの倍率(`--fle-scale`)。情報窓の高さも同じ倍率で変わる
  const scale = parseFloat(getComputedStyle(boxEl).getPropertyValue('--fle-scale')) || 1
  return {
    box: boxEl.clientHeight,
    line: parseFloat(style.lineHeight) || 26,
    // 上の余白は、下寄せ(alignToBottom)で増えていることがあるので、下と同じとみなす
    chrome: parseFloat(style.paddingBottom) * 2 + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth),
    clock: CLOCK_REM * rem * scale,
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
  /** 行の高さが変わるもの(文字の大きさなど) */
  deps: unknown[]
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState<LogMetrics | null>(null)

  const remeasure = () => {
    const ta = taRef.current
    const box = boxRef.current
    if (ta && box) setMetrics(measure(ta, box))
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
