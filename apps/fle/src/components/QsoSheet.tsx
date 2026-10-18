import type { LogView } from '@/lib/fle'
import { Sheet } from '@/components/Sheet'

interface Props {
  open: boolean
  onClose: () => void
  view: LogView | null
  /** 行番号(0始まり)の位置へカーソルを移す */
  onJump: (line: number) => void
}

export function QsoSheet({ open, onClose, view, onJump }: Props) {
  const qsos = view?.qsos ?? []
  const errors = view?.errors ?? []
  const title = `${qsos.length} QSO${errors.length ? ` / エラー ${errors.length}` : ''}`

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {qsos.length === 0 && errors.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">まだQSOがありません</p>
      ) : (
        <ul className="space-y-2">
          {errors.map((e, i) => (
            <li key={`e${i}`}>
              <button
                type="button"
                onClick={() => onJump(e.line)}
                className="w-full text-left p-3 min-h-14 rounded-xl border-2 border-red-700 bg-red-50 text-red-950 dark:border-red-400 dark:bg-red-950 dark:text-red-100 flex gap-3 items-center"
              >
                <span className="font-mono text-sm font-bold">L{e.line + 1}</span>
                <span>
                  <span className="block">{e.message}</span>
                  <span className="block text-sm">タップでその行へ</span>
                </span>
              </button>
            </li>
          ))}
          {qsos.map((q) => (
            <li key={q.line}>
              <button
                type="button"
                onClick={() => onJump(q.line)}
                className="w-full text-left p-3 min-h-14 rounded-xl border-2 border-gray-300 dark:border-gray-700 flex gap-3 items-center"
              >
                <span className="font-mono text-sm font-bold text-gray-700 dark:text-gray-300">
                  L{q.line + 1}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex justify-between gap-2">
                    <span className="font-mono text-lg font-bold">{q.call}</span>
                    <b className="whitespace-nowrap">
                      {q.band} {q.mode}
                    </b>
                  </span>
                  <span className="block text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                    {q.time} {q.rstSent}/{q.rstRcvd} {q.refs.join(' ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
