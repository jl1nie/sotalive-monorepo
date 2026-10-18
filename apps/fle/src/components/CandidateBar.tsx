import { Check } from 'lucide-react'
import { timeLabel, type LogView, type QsoView } from '@/lib/fle'
import { errorText } from '@/lib/errors'
import { useI18n } from '@/lib/i18n'

interface Props {
  view: LogView | null
  /** 確定したあとの、この行の姿(時刻・バンド・モード・RSTが入ったもの)。なければ現在の解釈を使う */
  preview: QsoView | null
  /** カーソルのある行(0始まり) */
  caretLine: number
  onOpenList: () => void
  /** この行を確定して、次の行へ進む */
  onConfirm: () => void
}

const TONE = {
  ok: 'border-emerald-700 bg-emerald-50 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-100',
  plain: 'border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-900',
} as const

const BAR = 'flex-1 min-w-0 rounded-xl border-2 overflow-hidden'

/**
 * カーソルのある行を、補完した結果で見せる(IMEの候補のような表示)。
 * 解釈できた行(緑)は、そのまま押して確定できる。
 */
export function CandidateBar({ view, preview, caretLine, onOpenList, onConfirm }: Props) {
  const { t, lang } = useI18n()
  const qso = preview ?? view?.qsos.find((q) => q.line === caretLine) ?? null
  const error = view?.errors.find((e) => e.line === caretLine)
  // 入力中の行の誤りは、まだ途中なので数えない(カーソルを離れた行の誤りだけ、赤で知らせる)
  const errorCount = view?.errors.filter((e) => e.line !== caretLine).length ?? 0

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
        aria-label={t('bar.openList')}
        className={`flex-none min-w-16 px-2 rounded-xl border-2 bg-white dark:bg-gray-950 flex flex-col items-center justify-center leading-tight tabular-nums ${
          errorCount > 0
            ? 'border-red-700 text-red-700 dark:border-red-400 dark:text-red-300'
            : 'border-gray-500'
        }`}
      >
        <b className="text-xl">{view?.qsos.length ?? 0}</b>
        <small className="text-xs font-bold">QSO{errorCount > 0 && ` ⚠${errorCount}`}</small>
      </button>

      {qso && !error ? (
        <button
          type="button"
          onClick={onConfirm}
          // 押してもテキスト入力からフォーカスを奪わない(キーボードを閉じない)
          onPointerDown={(e) => e.preventDefault()}
          aria-label={t('bar.confirmLabel')}
          className={`${BAR} ${TONE.ok} flex items-stretch text-left`}
        >
          <span className="flex-1 min-w-0 px-3 py-2 flex flex-col justify-center gap-0.5">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xl font-bold break-all leading-tight">{qso.call}</span>
              <span className="font-bold whitespace-nowrap">
                {qso.band} {qso.mode}
              </span>
            </span>
            <span className="flex flex-wrap gap-x-3 text-sm font-semibold font-mono tabular-nums">
              <span>{timeLabel(qso)}</span>
              <span>
                {qso.rstSent}/{qso.rstRcvd}
              </span>
              {qso.refs.map((r) => (
                <span key={r}>{r}</span>
              ))}
              {qso.comment && <span className="font-sans">{qso.comment}</span>}
            </span>
          </span>
          <span className="flex-none w-16 flex flex-col items-center justify-center gap-0.5 border-l-2 border-emerald-700/40 dark:border-emerald-400/40 font-bold text-sm">
            <Check className="w-6 h-6" aria-hidden="true" />
            {t('bar.confirm')}
          </span>
        </button>
      ) : (
        <div
          aria-live="polite"
          className={`${BAR} px-3 py-2 flex flex-col justify-center gap-0.5 ${TONE.plain}`}
        >
          <p className="font-semibold line-clamp-2">{context || t('bar.empty')}</p>
          {/* 入力中の誤りは、色も記号も付けず、小さく添えるだけ */}
          {error && (
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{errorText(error, lang)}</p>
          )}
        </div>
      )}
    </div>
  )
}
