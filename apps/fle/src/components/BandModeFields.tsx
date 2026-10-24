import { useT } from '@/lib/i18n'
import { useFieldKeyProps } from '@/hooks/useFieldKeys'
import type { BandMode } from '@/lib/bandMode'

/**
 * 新しいログの、予定の周波数(またはバンド)とモード。最初の QSO の前に1行で書いておく
 * (着いてすぐ電波を出しても、周波数とモードを書き忘れない)
 */
export function BandModeFields({ value, onChange, error }: { value: BandMode; onChange: (v: BandMode) => void; error?: string }) {
  const t = useT()
  const fieldKeys = useFieldKeyProps()
  const input = (key: keyof BandMode, example: string) => (
    <div className="flex-1 min-w-0">
      <label htmlFor={`place-${key}`} className="label">
        {t(key === 'freq' ? 'place.freq' : 'place.mode')}
      </label>
      <input
        id={`place-${key}`}
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        placeholder={t('place.example', { value: example })}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        {...fieldKeys}
        aria-invalid={error ? true : undefined}
        className="input font-mono"
      />
    </div>
  )
  return (
    <div>
      <div className="flex items-end gap-2">
        {input('freq', '7.032')}
        {input('mode', 'CW')}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : (
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{t('place.bandModeHint')}</p>
      )}
    </div>
  )
}
