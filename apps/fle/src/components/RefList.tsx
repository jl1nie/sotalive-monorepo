import { distanceLabel, type RefCandidate } from '@/lib/reference'

interface Props {
  items: RefCandidate[]
  onPick: (candidate: RefCandidate) => void
  /** 山・公園の区別を表示する(近くの一覧のとき) */
  showKind?: boolean
}

/** 山・公園の候補の一覧。押してもテキスト入力からフォーカスを奪わない(キーボードを閉じない)。 */
export function RefList({ items, onPick, showKind }: Props) {
  return (
    <ul onPointerDown={(e) => e.preventDefault()} className="mt-1 space-y-1">
      {items.map((c) => (
        <li key={`${c.kind}:${c.code}`}>
          <button
            type="button"
            onClick={() => onPick(c)}
            className="w-full text-left px-3 py-2 min-h-12 rounded-xl border-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-baseline gap-3"
          >
            {showKind && (
              <span className="flex-none text-xs font-bold text-gray-700 dark:text-gray-300">
                {c.kind === 'sota' ? '山' : '公園'}
              </span>
            )}
            <span className="flex-none font-mono font-bold">{c.code}</span>
            <span className="flex-1 min-w-0 truncate">{c.name}</span>
            <span className="flex-none text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
              {c.distanceKm !== undefined ? distanceLabel(c.distanceKm) : c.detail}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
