import { useKeyPad } from '@/hooks/useKeyPad'
import { useT } from '@/lib/i18n'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

/** リリース版と同じ見た目 */
const KEY =
  'flex-1 min-w-0 h-11 rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 font-mono text-lg font-bold'

interface Props {
  onKey: (key: string) => void
  /** 左右になぞったとき、カーソルを動かす文字数(左が負) */
  onMove?: (delta: number) => void
}

/**
 * 従来の配置で、ソフトキーボードの上に出す、数字の行(0〜9 と / -)。押してもテキスト入力からフォーカスを奪わない
 * (キーボードを切り替えずに数字が打てる)。
 * 左右になぞると、数字は入らず、カーソルが動く(指先で文字の間を狙わずに、1文字ずつ直せる)。
 */
export function DigitRow({ onKey, onMove = () => {} }: Props) {
  const t = useT()
  // ⌫ はないので、消す操作は渡さない
  const { padProps, tap } = useKeyPad(onMove, () => {})

  return (
    <div
      role="group"
      aria-label={t('digits.label')}
      title={t('digits.swipe')}
      {...padProps}
      // なぞる操作を、ページのスクロールに取られない
      className="flex-none flex gap-1 touch-none"
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
    </div>
  )
}
