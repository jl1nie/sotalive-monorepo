import { keepFocus } from '@/lib/keepFocus'
import { useT } from '@/lib/i18n'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '/', '-']

interface Props {
  onKey: (key: string) => void
}

/** ソフトキーボードの上に出す数字の行。押してもテキスト入力からフォーカスを奪わない(キーボードを切り替えずに数字が打てる)。 */
export function DigitRow({ onKey }: Props) {
  const t = useT()
  return (
    <div role="group" aria-label={t('digits.label')} {...keepFocus} className="flex-none flex gap-1">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          className="flex-1 min-w-0 h-11 rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 font-mono text-lg font-bold"
        >
          {k}
        </button>
      ))}
    </div>
  )
}
