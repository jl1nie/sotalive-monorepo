import { useEffect, useRef, type PointerEvent } from 'react'
import { Delete } from 'lucide-react'
import { useT } from '@/lib/i18n'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

/** なぞりとみなす距離と、1文字動かす距離(px) */
const SWIPE_START = 10
const STEP = 20
/** ⌫ を押し続けたとき、連続で消し始めるまでと、消す間隔(ms) */
const REPEAT_DELAY = 400
const REPEAT_EVERY = 70

const KEY =
  'min-w-0 h-11 rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 font-mono text-lg font-bold flex items-center justify-center active:bg-gray-300 dark:active:bg-gray-700'

interface Props {
  onKey: (key: string) => void
  /** 左右になぞったとき、カーソルを動かす文字数(左が負) */
  onMove?: (delta: number) => void
  /** ⌫: カーソルの前の1文字(選択があれば、その範囲)を消す */
  onBackspace?: () => void
}

/**
 * ソフトキーボードの上に出す、数字と、よく使うキーの2段。押してもテキスト入力からフォーカスを奪わない
 * (キーボードを切り替えずに数字が打てる)。⌫ と空白も、ここで打てる(OSのキーボードの端まで指と目を動かさない)。
 * 左右になぞると、数字は入らず、カーソルが動く(指先で文字の間を狙わずに、1文字ずつ直せる)。
 */
export function DigitRow({ onKey, onMove = () => {}, onBackspace = () => {} }: Props) {
  const t = useT()
  const drag = useRef<{ x: number; moved: number; swiping: boolean } | null>(null)
  // なぞったあとの click は、数字を入れない
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

  /** 数字などのキー。なぞったあとの click では、打たない */
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

  return (
    <div
      role="group"
      aria-label={t('digits.label')}
      title={t('digits.swipe')}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={up}
      onMouseDown={(e) => e.preventDefault()}
      // なぞる操作を、ページのスクロールに取られない。押し続けで、文字の選択やメニューを出さない
      className="flex-none grid grid-cols-10 gap-1 touch-none select-none [-webkit-touch-callout:none]"
    >
      {DIGITS.map((k) => (
        <button key={k} type="button" onClick={tap(() => onKey(k))} className={KEY}>
          {k}
        </button>
      ))}
      <button type="button" onClick={tap(() => onKey('/'))} className={KEY}>
        /
      </button>
      <button type="button" onClick={tap(() => onKey('-'))} className={KEY}>
        -
      </button>
      <button type="button" aria-label={t('digits.left')} onClick={tap(() => onMove(-1))} className={KEY}>
        ←
      </button>
      <button type="button" aria-label={t('digits.right')} onClick={tap(() => onMove(1))} className={KEY}>
        →
      </button>
      <button
        type="button"
        aria-label={t('digits.space')}
        onClick={tap(() => onKey(' '))}
        className={`${KEY} col-span-4 font-sans text-sm`}
      >
        {t('digits.space')}
      </button>
      <button
        type="button"
        aria-label={t('digits.backspace')}
        onPointerDown={backspaceDown}
        onClick={backspaceClick}
        className={`${KEY} col-span-2`}
      >
        <Delete className="w-6 h-6" aria-hidden="true" />
      </button>
    </div>
  )
}
