import { useState, type ReactNode } from 'react'
import { Check, CornerDownLeft, Delete, Globe, Undo2 } from 'lucide-react'
import { useKeyPad } from '@/hooks/useKeyPad'
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
const SPAN = { 2: 'col-span-2', 3: 'col-span-3', 6: 'col-span-6' } as const
type Span = keyof typeof SPAN

/** 文字のキー */
const CHAR = `${FACE} bg-gray-100 dark:bg-gray-900 font-mono text-xl font-bold`
/** 文字でないキー(⌫・空白・🌐 など)は、少し沈んだ色で分ける */
const FN = `${FACE} bg-gray-200 dark:bg-gray-800 font-bold text-sm`

interface Props {
  onKey: (key: string) => void
  /** 空白・← → からなぞったとき、← → を押したときに、カーソルを動かす文字数(左が負) */
  onMove: (delta: number) => void
  /** ⌫: カーソルの前の1文字(選択があれば、その範囲)を消す */
  onBackspace: () => void
  /** 右下のキー: 確定できる行(緑)なら確定、ほかは行末で改行して次の行へ */
  confirmable: boolean
  onConfirm: () => void
  onNewline: () => void
  /** 🌐: OS のキーボードに切り替える(日本語のメッセージ・備考など) */
  onOsKeyboard: () => void
  /** ↶: 直前の編集(⌫ の連打や、続けて打った分)を取り消す */
  onUndo: () => void
}

/**
 * フルキーの配置の、画面のキーボード(OS のキーボードの代わり)。FLE で打つのは、ほとんどが英数字と記号なので、
 * 数字・英字・/ - 空白 ⌫ と、確定(次の行)を1枚にまとめる。押してもテキスト入力からフォーカスを奪わない。
 * 英字のキーは大文字で見せ、小文字で入れる(FLE は大文字・小文字を区別しない)。
 * 打ちやすさのために、スマホのキーボードと同じく:
 * - キーの間の隙間を押しても、近いキーが入る
 * - 押している文字を、指の上に吹き出しで見せる(指の下のキーは見えない)
 * - 文字のキーは、指が少し横に滑っても、なぞりにしない。なぞってカーソルを動かすのは、空白と ← → から
 */
export function FullKeyboard({
  onKey,
  onMove,
  onBackspace,
  confirmable,
  onConfirm,
  onNewline,
  onOsKeyboard,
  onUndo,
}: Props) {
  const t = useT()
  const { padProps, tap, backspaceProps } = useKeyPad(onMove, onBackspace, true)
  // 押している文字のキー(吹き出しを出す)
  const [pressed, setPressed] = useState<string | null>(null)
  const release = () => setPressed(null)

  /** 文字を打つキー。押している間、吹き出しで文字を見せる */
  const charKey = (k: string, span: Span = 2) => (
    <button
      key={k}
      type="button"
      onPointerDown={() => setPressed(k)}
      onClick={tap(() => onKey(k))}
      className={`${HIT} ${SPAN[span]}`}
    >
      <span className={`${CHAR} uppercase`}>{k}</span>
      {pressed === k && (
        <span
          aria-hidden="true"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-20 min-w-12 h-14 px-2 rounded-xl border-2 border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-700 shadow-lg flex items-center justify-center font-mono text-3xl font-bold uppercase pointer-events-none"
        >
          {k}
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
    // 段の高さを、キーボードの幅から決める(正方形のキー)
    <div className="@container flex-none">
      <div
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
        // なぞる操作を、ページのスクロールに取られない。押し続けで(⌫)、文字の選択やメニューを出さない。
        // 20列: 英字は2列ずつ。下段は半キーずらす。キーの間に隙間を作らない(押せる範囲)
        className="relative grid grid-cols-20 auto-rows-[min(10cqw,3rem)] touch-none select-none [-webkit-touch-callout:none]"
      >
        {DIGITS.map((k) => charKey(k))}
        {ROW1.map((k) => charKey(k))}
        {ROW2.map((k) => charKey(k))}
        <span aria-hidden="true" />
        {ROW3.map((k) => charKey(k))}
        <button type="button" aria-label={t('digits.backspace')} {...backspaceProps} className={`${HIT} col-span-3`}>
          <span className={FN}>
            <Delete className="w-6 h-6" aria-hidden="true" />
          </span>
        </button>
        {fnKey(t('keys.os'), onOsKeyboard, <Globe className="w-5 h-5" aria-hidden="true" />, 2)}
        {fnKey(t('keys.undo'), onUndo, <Undo2 className="w-5 h-5" aria-hidden="true" />, 2)}
        {fnKey(t('digits.left'), () => onMove(-1), '←', 2, true)}
        {fnKey(t('digits.space'), () => onKey(' '), t('digits.space'), 6, true)}
        {fnKey(t('digits.right'), () => onMove(1), '→', 2, true)}
        {/* 右下(OS のキーボードの Enter の位置)で、次の行へ。確定できる行は、確定して次の行へ */}
        {confirmable ? (
          <button type="button" aria-label={t('bar.confirmLabel')} onClick={tap(onConfirm)} className={`${HIT} col-span-6`}>
            <span
              className={`${FN} gap-1 !bg-emerald-700 !text-white !border-emerald-700 dark:!bg-emerald-600 dark:!border-emerald-600`}
            >
              <Check className="w-5 h-5" aria-hidden="true" />
              {t('bar.confirm')}
            </span>
          </button>
        ) : (
          fnKey(
            t('bar.newlineLabel'),
            onNewline,
            <>
              <CornerDownLeft className="w-5 h-5" aria-hidden="true" />
              <span className="ml-1">{t('bar.newline')}</span>
            </>,
            6
          )
        )}
      </div>
    </div>
  )
}
