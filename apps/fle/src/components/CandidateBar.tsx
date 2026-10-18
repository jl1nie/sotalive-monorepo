import type { LogView } from '@/lib/fle'

interface Props {
  view: LogView | null
  /** カーソルのある行(0始まり) */
  caretLine: number
  onOpenList: () => void
}

const TONE = {
  ok: 'border-emerald-700 bg-emerald-50 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-100',
  typing:
    'border-amber-700 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100',
  plain: 'border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-900',
} as const

/** カーソルのある行を、前の行から補完した結果で見せる(IMEの候補のような表示)。 */
export function CandidateBar({ view, caretLine, onOpenList }: Props) {
  const qso = view?.qsos.find((q) => q.line === caretLine)
  const error = view?.errors.find((e) => e.line === caretLine)
  const errorCount = view?.errors.length ?? 0
  const tone = qso ? 'ok' : error ? 'typing' : 'plain'

  const lastQso = view?.qsos.filter((q) => q.line < caretLine).at(-1)
  const context = view
    ? [view.mycall, view.mysota, view.mywwff, ...view.mypota, lastQso?.band, lastQso?.mode]
        .filter(Boolean)
        .join('  ')
    : ''

  return (
    <div className="flex-none flex gap-2 h-[72px]">
      <button
        type="button"
        onClick={onOpenList}
        aria-label="QSO一覧を開く"
        className={`flex-none min-w-16 px-2 rounded-xl border-2 bg-white dark:bg-gray-950 flex flex-col items-center justify-center leading-tight tabular-nums ${
          errorCount > 0
            ? 'border-red-700 text-red-700 dark:border-red-400 dark:text-red-300'
            : 'border-gray-500'
        }`}
      >
        <b className="text-xl">{view?.qsos.length ?? 0}</b>
        <small className="text-xs font-bold">QSO{errorCount > 0 && ` ⚠${errorCount}`}</small>
      </button>

      <div
        aria-live="polite"
        className={`flex-1 min-w-0 px-3 py-2 rounded-xl border-2 overflow-hidden flex flex-col justify-center gap-0.5 ${TONE[tone]}`}
      >
        {qso ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xl font-bold break-all leading-tight">{qso.call}</span>
              <span className="font-bold whitespace-nowrap">
                {qso.band} {qso.mode}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 text-sm font-semibold font-mono tabular-nums">
              <span>{qso.time}</span>
              <span>
                {qso.rstSent}/{qso.rstRcvd}
              </span>
              {qso.refs.map((r) => (
                <span key={r}>{r}</span>
              ))}
              {qso.comment && <span className="font-sans">{qso.comment}</span>}
            </div>
          </>
        ) : error ? (
          <p className="font-semibold line-clamp-2">入力中… {error.message}</p>
        ) : (
          <p className="font-semibold line-clamp-2">{context || 'ログを入力してください'}</p>
        )}
      </div>
    </div>
  )
}
