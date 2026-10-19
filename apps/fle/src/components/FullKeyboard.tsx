import { Check, CornerDownLeft, Delete, Globe } from 'lucide-react'
import { useKeyPad } from '@/hooks/useKeyPad'
import { useT } from '@/lib/i18n'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const ROW1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']
const ROW2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l']
const ROW3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm']

const KEY =
  'min-w-0 h-11 rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 font-mono text-lg font-bold flex items-center justify-center active:bg-gray-300 dark:active:bg-gray-700'
/** 文字でないキー(⌫・空白・🌐 など)は、少し沈んだ色で分ける */
const FN_KEY =
  'min-w-0 h-11 rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-gray-200 dark:bg-gray-800 font-bold text-sm flex items-center justify-center active:bg-gray-300 dark:active:bg-gray-700'

interface Props {
  onKey: (key: string) => void
  /** 左右になぞったとき・← → で、カーソルを動かす文字数(左が負) */
  onMove: (delta: number) => void
  /** ⌫: カーソルの前の1文字(選択があれば、その範囲)を消す */
  onBackspace: () => void
  /** 右下のキー: 確定できる行(緑)なら確定、ほかは行末で改行して次の行へ */
  confirmable: boolean
  onConfirm: () => void
  onNewline: () => void
  /** 🌐: OS のキーボードに切り替える(日本語のメッセージ・備考など) */
  onOsKeyboard: () => void
}

/**
 * フルキーの配置の、画面のキーボード(OS のキーボードの代わり)。FLE で打つのは、ほとんどが英数字と記号なので、
 * 数字・英字・/ - 空白 ⌫ と、確定(次の行)を1枚にまとめる。押してもテキスト入力からフォーカスを奪わない。
 * どこからでも左右になぞると、キーは入らず、カーソルが動く。英字のキーは大文字で見せ、小文字で入れる(FLE は大文字・小文字を区別しない)。
 */
export function FullKeyboard({ onKey, onMove, onBackspace, confirmable, onConfirm, onNewline, onOsKeyboard }: Props) {
  const t = useT()
  const { padProps, tap, backspaceProps } = useKeyPad(onMove, onBackspace)

  // キーの表示は大文字(見慣れた形で、屋外でも読みやすい)。打つのは小文字
  const letter = (k: string) => (
    <button key={k} type="button" onClick={tap(() => onKey(k))} className={`${KEY} col-span-2 uppercase`}>
      {k}
    </button>
  )

  return (
    <div
      role="group"
      aria-label={t('keys.label')}
      title={t('digits.swipe')}
      {...padProps}
      // なぞる操作を、ページのスクロールに取られない。押し続けで(⌫)、文字の選択やメニューを出さない。
      // 20列: 英字は2列ずつ。中段は半キーずらす(ふつうのキーボードと同じ並び)
      className="flex-none grid grid-cols-20 gap-1 touch-none select-none [-webkit-touch-callout:none]"
    >
      {DIGITS.map(letter)}
      {ROW1.map(letter)}
      <span aria-hidden="true" />
      {ROW2.map(letter)}
      <span aria-hidden="true" />
      <button type="button" onClick={tap(() => onKey('/'))} className={`${KEY} col-span-3`}>
        /
      </button>
      {ROW3.map(letter)}
      <button type="button" aria-label={t('digits.backspace')} {...backspaceProps} className={`${FN_KEY} col-span-3`}>
        <Delete className="w-6 h-6" aria-hidden="true" />
      </button>
      <button type="button" aria-label={t('keys.os')} onClick={tap(onOsKeyboard)} className={`${FN_KEY} col-span-2`}>
        <Globe className="w-5 h-5" aria-hidden="true" />
      </button>
      <button type="button" onClick={tap(() => onKey('-'))} className={`${KEY} col-span-2`}>
        -
      </button>
      <button type="button" aria-label={t('digits.left')} onClick={tap(() => onMove(-1))} className={`${FN_KEY} col-span-2`}>
        ←
      </button>
      <button type="button" aria-label={t('digits.space')} onClick={tap(() => onKey(' '))} className={`${FN_KEY} col-span-6`}>
        {t('digits.space')}
      </button>
      <button type="button" aria-label={t('digits.right')} onClick={tap(() => onMove(1))} className={`${FN_KEY} col-span-2`}>
        →
      </button>
      {/* 右下(OS のキーボードの Enter の位置)で、次の行へ。確定できる行は、確定して次の行へ */}
      {confirmable ? (
        <button
          type="button"
          aria-label={t('bar.confirmLabel')}
          onClick={tap(onConfirm)}
          className={`${FN_KEY} col-span-6 gap-1 !bg-emerald-700 !text-white !border-emerald-700 dark:!bg-emerald-600 dark:!border-emerald-600`}
        >
          <Check className="w-5 h-5" aria-hidden="true" />
          {t('bar.confirm')}
        </button>
      ) : (
        <button type="button" aria-label={t('bar.newlineLabel')} onClick={tap(onNewline)} className={`${FN_KEY} col-span-6 gap-1`}>
          <CornerDownLeft className="w-5 h-5" aria-hidden="true" />
          {t('bar.newline')}
        </button>
      )}
    </div>
  )
}
