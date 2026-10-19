import { keepFocus } from '@/lib/keepFocus'
import type { Candidate } from '@/lib/fle'
import { useT } from '@/lib/i18n'

const KIND_KEY = {
  command: 'suggest.command',
  band: 'suggest.band',
  mode: 'suggest.mode',
  day: 'suggest.day',
  timezone: 'suggest.timezone',
  rig: 'suggest.rig',
} as const

interface Props {
  candidates: Candidate[]
  onPick: (candidate: Candidate) => void
  overBar?: boolean
}

/**
 * 補完候補。入力欄の下端か(従来の配置)、候補バー(`overBar`、コンパクトな配置。打っている行のすぐ下、目の行く所)に重ねる。
 * 出入りしても、入力欄の高さも、打っている行の位置も変わらない。
 */
export function SuggestStrip({ candidates, onPick, overBar = false }: Props) {
  const t = useT()
  if (candidates.length === 0) return null
  return (
    <ul
      aria-label={t('suggest.label')}
      // タップしても入力欄からフォーカスを奪わない(キーボードを閉じない)
      {...keepFocus}
      className={`absolute flex gap-2 overflow-x-auto rounded-xl border-2 border-gray-500 bg-white dark:bg-gray-950 ${
        overBar ? 'inset-0 z-10 items-center px-1.5' : 'inset-x-2 bottom-2 p-1.5'
      }`}
    >
      {candidates.map((c) => (
        <li key={`${c.kind}:${c.text}`} className="flex-none">
          <button
            type="button"
            onClick={() => onPick(c)}
            className="min-h-12 px-3.5 rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 flex flex-col items-start justify-center leading-tight"
          >
            <b className="font-mono text-base">{c.text}</b>
            <small className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
              {t(KIND_KEY[c.kind])}
            </small>
          </button>
        </li>
      ))}
    </ul>
  )
}
