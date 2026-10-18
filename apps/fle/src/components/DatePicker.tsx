import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

interface Props {
  id: string
  /** `YYYY-MM-DD`。未選択は空 */
  value: string
  onChange: (value: string) => void
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

/**
 * 月のカレンダーから日付を選ぶ。ブラウザの日付入力は、端末・ブラウザによって
 * (例: iPhone の Chrome)年/月/日の欄に数字を打つ形になるので、使わない。
 */
export function DatePicker({ id, value, onChange }: Props) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const now = new Date()
  const start = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : iso(now.getFullYear(), now.getMonth(), now.getDate())
  const [year, setYear] = useState(Number(start.slice(0, 4)))
  const [month, setMonth] = useState(Number(start.slice(5, 7)) - 1)

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }
  const first = new Date(year, month, 1).getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const locale = lang === 'en' ? 'en-US' : 'ja-JP'
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }))
  const today = iso(now.getFullYear(), now.getMonth(), now.getDate())

  return (
    <div>
      <button
        type="button"
        id={id}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="input text-left min-h-12"
      >
        {value || <span className="text-gray-500">{t('date.none')}</span>}
      </button>
      {open && (
        <div className="mt-2 p-2 rounded-xl border-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-1">
            <button type="button" onClick={() => shift(-1)} aria-label={t('date.prev')} className="btn-secondary !min-h-11 !min-w-11 !px-0">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-bold" aria-live="polite">
              {new Date(year, month, 1).toLocaleDateString(locale, { year: 'numeric', month: 'long' })}
            </span>
            <button type="button" onClick={() => shift(1)} aria-label={t('date.next')} className="btn-secondary !min-h-11 !min-w-11 !px-0">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-sm text-gray-700 dark:text-gray-300">
            {weekdays.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 mt-1">
            {cells.map((d, i) =>
              d === null ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  aria-pressed={iso(year, month, d) === value}
                  onClick={() => {
                    onChange(iso(year, month, d))
                    setOpen(false)
                  }}
                  className={`min-h-11 rounded-lg font-semibold tabular-nums border-2 ${
                    iso(year, month, d) === value
                      ? 'bg-primary-700 text-white border-primary-700'
                      : iso(year, month, d) === today
                        ? 'border-primary-700'
                        : 'border-transparent'
                  }`}
                >
                  {d}
                </button>
              )
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => {
                onChange(today)
                setOpen(false)
              }}
            >
              {t('date.today')}
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              {t('date.clear')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
