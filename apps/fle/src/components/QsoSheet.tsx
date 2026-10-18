import { timeLabel, type LogView } from '@/lib/fle'
import { Sheet } from '@/components/Sheet'
import { errorText } from '@/lib/errors'
import { useI18n } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  view: LogView | null
  /** 本文(誤りの語を見せるため) */
  text: string
  /** 行番号(0始まり)の位置へカーソルを移す。範囲があれば、その範囲を選ぶ */
  onJump: (line: number, range?: [number, number]) => void
}

export function QsoSheet({ open, onClose, view, text, onJump }: Props) {
  const { t, lang } = useI18n()
  const qsos = view?.qsos ?? []
  const errors = view?.errors ?? []
  // 時刻の誤りがある行のQSOは、時刻が 00:00 になっている。実際の時刻ではないので出さない
  const errorLines = new Set(errors.map((e) => e.line))
  const title = errors.length
    ? t('list.errorsTitle', { qsos: qsos.length, errors: errors.length })
    : t('list.title', { qsos: qsos.length })

  // 同じ原因の誤り(バンド未設定が行ごとに出る、など)は、1つにまとめる。タップすると最初の行へ行く
  const groups: {
    first: (typeof errors)[number]
    lines: number[]
    message: string
  }[] = []
  for (const e of errors) {
    const message = errorText(e, lang)
    const word = text.slice(e.from, e.to)
    const g = groups.find((x) => x.message === message && text.slice(x.first.from, x.first.to) === word)
    if (g) g.lines.push(e.line)
    else groups.push({ first: e, lines: [e.line], message })
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {qsos.length === 0 && errors.length === 0 ? (
        <p className="text-gray-700 dark:text-gray-300">{t('list.empty')}</p>
      ) : (
        <>
          {errors.length > 0 && (
            <p className="text-sm mb-2 text-gray-700 dark:text-gray-300">{t('list.tapToJump')}</p>
          )}
          <ul className="space-y-2">
            {groups.map(({ first: e, lines, message }, i) => (
              <li key={`e${i}`}>
                <button
                  type="button"
                  onClick={() => onJump(e.line, [e.from, e.to])}
                  className="w-full text-left p-3 min-h-14 rounded-xl border-2 border-red-700 bg-red-50 text-red-950 dark:border-red-400 dark:bg-red-950 dark:text-red-100 flex gap-3 items-center"
                >
                  <span className="font-mono text-sm font-bold">L{e.line + 1}</span>
                  <span>
                    <span className="block">{message}</span>
                    {e.to > e.from && (
                      <code className="block font-mono text-sm break-all">{text.slice(e.from, e.to)}</code>
                    )}
                    {lines.length > 1 && (
                      <span className="block text-sm">
                        {t('list.sameError', {
                          n: lines.length - 1,
                          lines: lines
                            .slice(1, 6)
                            .map((l) => `L${l + 1}`)
                            .join(' '),
                        })}
                      </span>
                    )}
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
                      {errorLines.has(q.line) ? '--:--' : timeLabel(q)} {q.rstSent}/{q.rstRcvd}{' '}
                      {q.refs.join(' ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  )
}
