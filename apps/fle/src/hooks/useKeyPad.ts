import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'

/** なぞりとみなす距離と、1文字動かす距離(px) */
const SWIPE_START = 10
const STEP = 20
/** ⌫ を押し続けたとき、連続で消し始めるまでと、消す間隔(ms) */
const REPEAT_DELAY = 400
const REPEAT_EVERY = 70

/**
 * 画面のキー(数字の行・フルキー)の共通の動き。
 * - 押してもテキスト入力からフォーカスを奪わない
 * - 左右になぞると、キーは入らず、カーソルが動く(指先で文字の間を狙わずに、1文字ずつ直せる)。
 *   `swipeOnlyMarked` なら、`data-swipe` を付けたキーから始めたときだけ(フルキーの文字キーは、素早く打つと
 *   指が横に滑るので、なぞりと取り違えない)
 * - ⌫ は押し続けると、続けて消す
 * - 指ごとに見る(親指2本で交互に打つとき、別の指の動きを、なぞりと取り違えない)
 */
export function useKeyPad(onMove: (delta: number) => void, onBackspace: () => void, swipeOnlyMarked = false) {
  const drag = useRef<{ id: number; x: number; moved: number; swiping: boolean } | null>(null)
  // なぞったあとの click は、キーを入れない
  const swiped = useRef(false)
  // ⌫ の押し続け。連続で消したあとの click は、もう1文字は消さない
  const repeat = useRef<{ timer: number; repeated: boolean } | null>(null)
  const latestBackspace = useRef(onBackspace)
  useEffect(() => {
    latestBackspace.current = onBackspace
  })

  const stopRepeat = () => {
    if (repeat.current) window.clearTimeout(repeat.current.timer)
  }
  useEffect(
    () => () => {
      if (repeat.current) window.clearTimeout(repeat.current.timer)
    },
    []
  )

  const down = (e: PointerEvent) => {
    // フォーカスを奪わない
    e.preventDefault()
    swiped.current = false
    const swipable = !swipeOnlyMarked || (e.target instanceof Element && e.target.closest('[data-swipe]') !== null)
    drag.current = swipable ? { id: e.pointerId, x: e.clientX, moved: 0, swiping: false } : null
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    if (!d.swiping && Math.abs(dx) < SWIPE_START) return
    d.swiping = true
    swiped.current = true
    stopRepeat()
    const steps = Math.trunc(dx / STEP)
    if (steps !== d.moved) {
      onMove(steps - d.moved)
      d.moved = steps
    }
  }
  const up = (e: PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null
    stopRepeat()
  }

  /** キーを押したとき。なぞったあとの click では、何もしない */
  const tap = (f: () => void) => () => {
    if (swiped.current) {
      swiped.current = false
      return
    }
    f()
  }

  const backspaceDown = () => {
    stopRepeat()
    const r = { timer: 0, repeated: false }
    const tick = () => {
      r.repeated = true
      latestBackspace.current()
      r.timer = window.setTimeout(tick, REPEAT_EVERY)
    }
    r.timer = window.setTimeout(tick, REPEAT_DELAY)
    repeat.current = r
  }
  const backspaceClick = () => {
    const repeated = repeat.current?.repeated ?? false
    stopRepeat()
    repeat.current = null
    if (swiped.current) {
      swiped.current = false
      return
    }
    if (!repeated) onBackspace()
  }

  return {
    /** キーを並べる枠に付ける(なぞりを受ける) */
    padProps: {
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: up,
      onMouseDown: (e: MouseEvent) => e.preventDefault(),
    },
    tap,
    /** ⌫ のキーに付ける */
    backspaceProps: { onPointerDown: backspaceDown, onClick: backspaceClick },
  }
}
