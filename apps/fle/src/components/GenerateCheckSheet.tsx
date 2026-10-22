import { useState } from 'react'
import { Crosshair } from 'lucide-react'
import type { FieldError, OutputWarning } from '@/lib/fle'
import { useGridLocate } from '@/hooks/useGridLocate'
import { Sheet } from '@/components/Sheet'
import { useT } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  warnings: OutputWarning[]
  /** 自局のコールサインの初期値(前回のもの) */
  initialCall: string
  /** 入力した自局・グリッドをログの先頭に書き込んで、生成する。誤りがあれば返す */
  onWriteAndGenerate: (values: { mycall: string; grid: string }) => Promise<FieldError[]>
  onGenerateAnyway: () => void
  /** 運用場所は、場所のシートで入力する */
  onOpenPlace: () => void
}

/** ファイルを生成する前に、ログに足りない情報を知らせて、入力を促す。そのまま生成もできる。 */
export function GenerateCheckSheet(props: Props) {
  return props.open ? <CheckForm {...props} /> : null
}

function CheckForm({ onClose, warnings, initialCall, onWriteAndGenerate, onGenerateAnyway, onOpenPlace }: Props) {
  const t = useT()
  const [mycall, setMycall] = useState(initialCall)
  const [grid, setGrid] = useState('')
  const [errors, setErrors] = useState<FieldError[]>([])
  const { locate, locating, message } = useGridLocate((g) => setGrid(g))

  const needs = (field: OutputWarning['field']) => warnings.some((w) => w.field === field)
  const error = (field: FieldError['field']) =>
    errors.some((e) => e.field === field) ? t(`field.${field}`) : undefined

  const writeAndGenerate = async () => {
    setErrors(await onWriteAndGenerate({ mycall: needs('mycall') ? mycall : '', grid: needs('grid') ? grid : '' }))
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('check.title')}
      closeLabel={t('sheet.cancel')}
      actions={
        <>
          <button type="button" onClick={writeAndGenerate} className="btn-success w-full">
            {t('check.write')}
          </button>
          <button type="button" onClick={onGenerateAnyway} className="btn-secondary w-full">
            {t('check.anyway')}
          </button>
        </>
      }
    >
      <ul className="space-y-2 mb-4">
        {warnings.map((w) => (
          <li
            key={w.code}
            className="p-3 rounded-xl border-2 border-amber-700 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100 flex gap-3 items-start"
          >
            <span className="flex-none text-xs font-bold mt-1">
              {w.severity === 'required' ? t('check.required') : t('check.recommended')}
            </span>
            <span>{t(`check.${w.code}`, { qsos: w.qsos })}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-3">
        {needs('mycall') && (
          <div>
            <label htmlFor="check-mycall" className="label">
              {t('place.mycall')}
            </label>
            <input
              id="check-mycall"
              value={mycall}
              onChange={(e) => setMycall(e.target.value)}
              placeholder={t('place.example', { value: 'JA1ABC/1' })}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error('mycall') ? true : undefined}
              className="input font-mono"
            />
            {error('mycall') && (
              <p role="alert" className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
                {error('mycall')}
              </p>
            )}
          </div>
        )}

        {needs('grid') && (
          <div>
            <label htmlFor="check-grid" className="label">
              {t('place.grid')}
            </label>
            <div className="flex gap-2">
              <input
                id="check-grid"
                value={grid}
                onChange={(e) => setGrid(e.target.value)}
                placeholder={t('place.example', { value: 'PM95uq' })}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error('grid') ? true : undefined}
                className="input font-mono"
              />
              <button
                type="button"
                onClick={locate}
                disabled={locating}
                aria-label={t('place.locateLabel')}
                className="btn-secondary !px-3 shrink-0"
              >
                <Crosshair className="w-5 h-5" />
                {t('place.locate')}
              </button>
            </div>
            {error('grid') && (
              <p role="alert" className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
                {error('grid')}
              </p>
            )}
            {message && <p role="status" className="mt-1 text-sm">{message}</p>}
          </div>
        )}

        {needs('place') && (
          <button type="button" onClick={onOpenPlace} className="btn-secondary w-full">
            {t('check.setPlace')}
          </button>
        )}
      </div>
      <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
        {t('check.note')}
      </p>
    </Sheet>
  )
}
