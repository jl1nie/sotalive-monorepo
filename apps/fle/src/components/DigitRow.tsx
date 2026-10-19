import { useRef, type PointerEvent } from 'react'
import { useT } from '@/lib/i18n'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '/', '-']

/** なぞりとみなす距離と、1文字動かす距離(px) */
const SWIPE_START = 10
const STEP = 20

interface Props {
  onKey: (key: string) => void
  /** 左右になぞったとき、カーソルを動かす文字数(左が負) */
  onMove?: (delta: number) => void
}

/**
 * ソフトキーボードの上に出す数字の行。押してもテキスト入力からフォーカスを奪わない(キーボードを切り替えずに数字が打てる)。
 * 左右になぞると、数字は入らず、カーソルが動く(指先で文字の間を狙わずに、1文字ずつ直せる)。
 */
export function DigitRow({ onKey, onMove = () => {} }: Props) {
  const t = useT()
  const drag = useRef<{ x: number; moved: number; swiping: boolean } | null>(null)
  // なぞったあとの click は、数字を入れない
  const swiped = useRef(false)

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
    const steps = Math.trunc(dx / STEP)
    if (steps !== d.moved) {
      onMove(steps - d.moved)
      d.moved = steps
    }
  }
  const up = () => {
    drag.current = null
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
      onMouseDown={(e) => e.preventDefault()}
      // なぞる操作を、ページのスクロールに取られない
      className="flex-none flex gap-1 touch-none"
    >
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            if (swiped.current) {
              swiped.current = false
              return
            }
            onKey(k)
          }}
          className="flex-1 min-w-0 h-11 rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 font-mono text-lg font-bold"
        >
          {k}
        </button>
      ))}
    </div>
  )
}
