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
 * - 左右になぞると、キーは入らず、カーソルが動く(指先で文字の間を狙わずに、1文字ずつ直せる)
 * - ⌫ は押し続けると、続けて消す
 */
export function useKeyPad(onMove: (delta: number) => void, onBackspace: () => void) {
  const drag = useRef<{ x: number; moved: number; swiping: boolean } | null>(null)
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
    drag.current = { x: e.clientX, moved: 0, swiping: false }
    swiped.current = false
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
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
  const up = () => {
    drag.current = null
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
