import type { Candidate } from '@/lib/fle'

const KIND_LABEL: Record<Candidate['kind'], string> = {
  command: 'コマンド',
  band: 'バンド',
  mode: 'モード',
  day: '日付',
}

interface Props {
  candidates: Candidate[]
  onPick: (candidate: Candidate) => void
}

/** 入力欄の下端に重ねる補完候補。出入りしても入力欄の高さは変わらない。 */
export function SuggestStrip({ candidates, onPick }: Props) {
  if (candidates.length === 0) return null
  return (
    <ul
      aria-label="補完候補"
      // タップしても入力欄からフォーカスを奪わない(キーボードを閉じない)
      onPointerDown={(e) => e.preventDefault()}
      className="absolute inset-x-2 bottom-2 flex gap-2 overflow-x-auto p-1.5 rounded-xl border-2 border-gray-500 bg-white dark:bg-gray-950"
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
              {KIND_LABEL[c.kind]}
            </small>
          </button>
        </li>
      ))}
    </ul>
  )
}
