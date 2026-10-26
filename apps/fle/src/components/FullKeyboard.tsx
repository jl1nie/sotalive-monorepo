import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { ArrowBigUp, CornerDownLeft, Delete, Globe, Undo2 } from 'lucide-react'
import { useKeyPad } from '@/hooks/useKeyPad'
import { KEY_SCALE_MAX, KEY_SCALE_MIN } from '@/hooks/useSettings'
import { useT } from '@/lib/i18n'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const ROW1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']
// - は L の右、/ は M の右(体が覚えている、PC のキーボードの並び)
const ROW2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '-']
const ROW3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm', '/']

/**
 * キーの押せる範囲は、隣のキーとの隙間まで(隙間を押しても、近いキーが入る)。見た目のキーは、その内側に描く。
 * キーは正方形(段の高さは、1キーの幅。広い画面では 48px まで)
 */
const HIT = 'relative min-w-0 h-full p-[2px] group'
const FACE =
  'h-full w-full rounded-lg border-2 border-gray-300 dark:border-gray-700 flex items-center justify-center group-active:bg-gray-300 dark:group-active:bg-gray-700'
/** キーの幅(20列のうち)。Tailwind が見つけられるよう、クラス名はそのまま書く */
const SPAN = { 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4', 6: 'col-span-6', 8: 'col-span-8' } as const
type Span = keyof typeof SPAN

/**
 * 続けて2回押すと、別の文字になるキー(キーを増やさずに、まれに使う記号を打つ)。
 * `--` も `//` も FLE では使わないので、取り違えない。`.` は周波数(`7.0295`)を細かく書くときだけ使うので、
 * キーにせず、いちばんよく打つ空白を広く取る
 */
const DOUBLE: Record<string, string> = { '-': ',', '/': '.' }
/** 2回目を「続けて」とみなす間隔(ms) */
const DOUBLE_TAP = 400

/**
 * 長押しで、別の文字になるキー(キーには書かない。押している間の吹き出しで見せる)。数字は続けて2回押す(599 など)ので、
 * 長押しにする。`#` は `JCC#` のように続けて書くこともあるので、空白は入れない。`+` は `day +`(0 の位置に + がある)、
 * `?` は聞き取れなかった文字(7 と形が似ている)
 */
const LONG: Record<string, string> = { '0': '+', '3': '#', '7': '?' }
/** 長押しとみなす長さ(ms)。寒いところや手袋で、ゆっくり押しても数字が入るよう、少し長め */
const LONG_PRESS = 500

/** 文字のキー */
const CHAR = `${FACE} bg-gray-100 dark:bg-gray-900 font-mono text-xl font-bold`
/** 文字でないキー(⌫・空白・🌐 など)は、少し沈んだ色で分ける */
const FN = `${FACE} bg-gray-200 dark:bg-gray-800 font-bold text-sm`

interface Props {
  /** キーの文字を打つ。`replacePrev` なら、カーソルの前の1文字を置き換える(続けて2回押したとき) */
  onKey: (key: string, replacePrev?: boolean) => void
  /** 空白・← → からなぞったとき、← → を押したときに、カーソルを動かす文字数(左が負) */
  onMove: (delta: number) => void
  /** ⌫: カーソルの前の1文字(選択があれば、その範囲)を消す */
  onBackspace: () => void
  /** 右下のキー ↵: エディタの Enter と同じく、カーソルの位置で改行する(次の行へ進むだけなら、緑のバーの OK) */
  onNewline: () => void
  /** 🌐: OS のキーボードに切り替える(日本語のメッセージ・備考など) */
  onOsKeyboard: () => void
  /** ↶: 直前の編集(⌫ の連打や、続けて打った分)を取り消す */
  onUndo: () => void
  /** キーの高さ(幅に対する倍率。1 は正方形) */
  keyScale: number
  /** 上の縁のつまみで、キーの高さを変えたとき(離したとき) */
  onKeyScale: (scale: number) => void
  /** 英字を大文字で打つか(Caps。Z の左のキー) */
  caps: boolean
  onToggleCaps: () => void
}

/**
 * フルキーの配置の、画面のキーボード(OS のキーボードの代わり)。FLE で打つのは、ほとんどが英数字と記号なので、
 * 数字・英字・/ - 空白 ⌫ と、改行を1枚にまとめる。- を続けて2回で , 、/ を続けて2回で . 、0・3・7 の長押しで + # ? になる。押してもテキスト入力からフォーカスを奪わない。
 * 英字は小文字で入れる(FLE は大文字・小文字を区別しない)。Caps(Z の左)がオンなら大文字で入れる。キーの文字も、入る文字に合わせる。
 * 打ちやすさのために、スマホのキーボードと同じく:
 * - キーの間の隙間を押しても、近いキーが入る
 * - 押している文字を、指の上に吹き出しで見せる(指の下のキーは見えない)
 * - 文字のキーは、指が少し横に滑っても、なぞりにしない。なぞってカーソルを動かすのは、空白と ← → から
 */
export function FullKeyboard({
  onKey,
  onMove,
  onBackspace,
  onNewline,
  onOsKeyboard,
  onUndo,
  keyScale,
  onKeyScale,
  caps,
  onToggleCaps,
}: Props) {
  const t = useT()
  // キーの高さ: 上の縁のつまみを上下にドラッグ(離すまで保存しない)。空いた高さは、ログではなくキーに使う
  const gridRef = useRef<HTMLDivElement>(null)
  const [dragScale, setDragScale] = useState<number | null>(null)
  const scale = dragScale ?? keyScale
  const sizing = useRef<{ id: number; y: number; scale: number; square: number } | null>(null)
  const startSize = (e: PointerEvent<HTMLDivElement>) => {
    const grid = gridRef.current
    if (!grid) return
    e.preventDefault()
    // 指がつまみから外れても、追い続ける
    e.currentTarget.setPointerCapture?.(e.pointerId)
    // 正方形のときの、キーボード全体(5段)の高さ
    sizing.current = { id: e.pointerId, y: e.clientY, scale, square: grid.offsetHeight / scale }
  }
  const moveSize = (e: PointerEvent<HTMLDivElement>) => {
    const s = sizing.current
    if (!s || s.id !== e.pointerId) return
    const next = s.scale + (s.y - e.clientY) / s.square
    setDragScale(Math.round(Math.min(KEY_SCALE_MAX, Math.max(KEY_SCALE_MIN, next)) * 20) / 20)
  }
  const endSize = (e: PointerEvent<HTMLDivElement>) => {
    if (sizing.current?.id !== e.pointerId) return
    sizing.current = null
    if (dragScale !== null) onKeyScale(dragScale)
    setDragScale(null)
  }
  const { padProps, tap, backspaceProps } = useKeyPad(onMove, onBackspace, true)
  // 押している文字のキー(吹き出しを出す)
  const [pressed, setPressed] = useState<string | null>(null)
  // 長押しになったキー(吹き出しを、長押しの文字にする。指を離したとき(pointerup)に、その文字を打つ。
  // Android の Chrome は、長押しのあと click を出さないことがあるので、click には頼らない)
  const [held, setHeld] = useState<string | null>(null)
  // 長押しで打ったキー。そのあとに click が来ても、もう打たない
  const heldTyped = useRef<string | null>(null)
  const holdTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(holdTimer.current), [])
  const press = (k: string) => {
    setPressed(k)
    setHeld(null)
    window.clearTimeout(holdTimer.current)
    if (LONG[k]) holdTimer.current = window.setTimeout(() => setHeld(k), LONG_PRESS)
  }
  const release = () => {
    setPressed(null)
    window.clearTimeout(holdTimer.current)
  }
  // 直前に押した文字のキーと時刻(続けて2回で、別の文字にする)
  const lastTap = useRef<{ k: string; at: number } | null>(null)
  /** `at` は押した時刻(イベントの timeStamp、ms) */
  const typeChar = (k: string, at: number) => {
    if (heldTyped.current === k) {
      heldTyped.current = null
      return
    }
    const now = at
    const prev = lastTap.current
    const alt = DOUBLE[k]
    if (alt && prev?.k === k && now - prev.at < DOUBLE_TAP) {
      lastTap.current = null
      onKey(alt, true)
      return
    }
    lastTap.current = { k, at: now }
    onKey(caps ? k.toUpperCase() : k)
  }

  // 指ごとに、押し始めたキー(指を離したときに、そのキーの文字を打つ)
  const downKey = useRef(new Map<number, string>())
  // 指を離して打った数。あとから来る click は、どのキーに向いていても、その分は打ち直さない(キーボードでの操作の click だけ、打つ)
  const typedOnUp = useRef(0)

  /** 文字を打つキー。押している間、吹き出しで文字を見せる */
  const charKey = (k: string, span: Span = 2) => (
    <button
      key={k}
      type="button"
      onPointerDown={(e) => {
        heldTyped.current = null
        downKey.current.set(e.pointerId, k)
        press(k)
      }}
      // 打つのは、click ではなく、指を離したとき。click は、速く打つと(指が重なると)、前のキーに向いたり
      // 落ちたりして、吹き出しの文字(押したキー)と違う文字が入る
      onPointerUp={(e) => {
        const down = downKey.current.get(e.pointerId)
        downKey.current.delete(e.pointerId)
        if (down !== k) return
        typedOnUp.current += 1
        if (held === k) {
          setHeld(null)
          lastTap.current = null
          heldTyped.current = k
          onKey(LONG[k])
          return
        }
        tap(() => typeChar(k, e.timeStamp))()
      }}
      onPointerCancel={(e) => downKey.current.delete(e.pointerId)}
      onClick={(e) => {
        if (typedOnUp.current > 0) {
          typedOnUp.current -= 1
          return
        }
        tap(() => typeChar(k, e.timeStamp))()
      }}
      className={`${HIT} ${SPAN[span]}`}
    >
      <span className={`${CHAR} ${caps ? 'uppercase' : ''} relative`}>
        {k}
        {/* 続けて2回押したときの文字を、右下に小さく(右上の , は ' に見える) */}
        {DOUBLE[k] && (
          <small aria-hidden="true" className="absolute bottom-0.5 right-1 text-xs leading-none">
            {DOUBLE[k]}
          </small>
        )}
      </span>
      {pressed === k && (
        <span
          aria-hidden="true"
          className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-20 min-w-12 h-14 px-2 rounded-xl border-2 border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-700 shadow-lg flex items-center justify-center font-mono text-3xl font-bold pointer-events-none ${caps ? 'uppercase' : ''}`}
        >
          {held === k ? LONG[k].trim() : k}
        </span>
      )}
    </button>
  )

  /** 文字でないキー */
  const fnKey = (label: string, onClick: () => void, face: ReactNode, span: Span, swipe = false) => (
    <button
      type="button"
      aria-label={label}
      onClick={tap(onClick)}
      // 空白と ← → からは、なぞってカーソルを動かせる
      data-swipe={swipe || undefined}
      className={`${HIT} ${SPAN[span]}`}
    >
      <span className={FN}>{face}</span>
    </button>
  )

  return (
    // 段の高さを、キーボードの幅から決める(正方形のキーに、倍率を掛ける)
    <div className="@container flex-none">
      {/* キーの高さを変えるつまみ(上へ引くと高く。いちばん下で正方形) */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={t('keys.resize')}
        title={t('keys.resize')}
        onPointerDown={startSize}
        onPointerMove={moveSize}
        onPointerUp={endSize}
        onPointerCancel={endSize}
        onMouseDown={(e) => e.preventDefault()}
        className="h-5 flex items-center justify-center touch-none cursor-row-resize"
      >
        <span className="w-14 h-1.5 rounded-full bg-gray-400 dark:bg-gray-600" />
      </div>
      <div
        ref={gridRef}
        role="group"
        aria-label={t('keys.label')}
        title={t('keys.swipe')}
        {...padProps}
        onPointerUp={(e) => {
          release()
          padProps.onPointerUp(e)
        }}
        onPointerCancel={(e) => {
          release()
          padProps.onPointerCancel(e)
        }}
        // 長押しで、コンテキストメニュー(文字の選択など)を出さない
        onContextMenu={(e) => e.preventDefault()}
        // なぞる操作を、ページのスクロールに取られない。押し続けで(⌫)、文字の選択やメニューを出さない。
        // 20列: 英字は2列ずつ。下段は半キーずらす。キーの間に隙間を作らない(押せる範囲)
        className="relative grid grid-cols-20 auto-rows-[calc(min(10cqw,3rem)*var(--key-scale))] touch-none select-none [-webkit-touch-callout:none]"
        style={{ '--key-scale': scale } as CSSProperties}
      >
        {DIGITS.map((k) => charKey(k))}
        {ROW1.map((k) => charKey(k))}
        {ROW2.map((k) => charKey(k))}
        {/* Z の左: Caps(英字を大文字で打つ)。スマホのキーボードと同じく、オフは中抜きの矢印、オンは塗りつぶし */}
        <button
          type="button"
          aria-label={t('keys.caps')}
          aria-pressed={caps}
          title={t('keys.caps')}
          onClick={tap(onToggleCaps)}
          className={`${HIT} col-span-2`}
        >
          <span className={FN}>
            <ArrowBigUp className="w-6 h-6" fill={caps ? 'currentColor' : 'none'} aria-hidden="true" />
          </span>
        </button>
        {ROW3.map((k) => charKey(k))}
        <button type="button" aria-label={t('digits.backspace')} {...backspaceProps} className={`${HIT} col-span-2`}>
          <span className={FN}>
            <Delete className="w-6 h-6" aria-hidden="true" />
          </span>
        </button>
        {fnKey(t('keys.os'), onOsKeyboard, <Globe className="w-5 h-5" aria-hidden="true" />, 2)}
        {fnKey(t('keys.undo'), onUndo, <Undo2 className="w-5 h-5" aria-hidden="true" />, 2)}
        {fnKey(t('digits.left'), () => onMove(-1), '←', 2, true)}
        {/* 空白と ↵ は、形と場所でわかるので、文字を書かない(OS のキーボードと同じ) */}
        {fnKey(t('digits.space'), () => onKey(' '), null, 8, true)}
        {fnKey(t('digits.right'), () => onMove(1), '→', 2, true)}
        {/* 右下(OS のキーボードの Enter の位置)で、カーソルの位置で改行する。次の行へ進むのは、ログを見ている緑のバーの右端の OK */}
        {fnKey(t('keys.newlineLabel'), onNewline, <CornerDownLeft className="w-5 h-5" aria-hidden="true" />, 4)}
      </div>
    </div>
  )
}
