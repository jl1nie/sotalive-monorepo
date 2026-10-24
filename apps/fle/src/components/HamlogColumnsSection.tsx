import { DEFAULT_HAMLOG_COLUMNS, HAMLOG_FIELDS, type HamlogColumns } from '@/lib/hamlog'
import { HAMLOG_COLUMN_MAX } from '@/hooks/useSettings'
import { useT, type MessageKey } from '@/lib/i18n'

interface Props {
  value: HamlogColumns
  onChange: (value: HamlogColumns) => void
}

const COLUMNS: { key: keyof HamlogColumns; label: string }[] = [
  { key: 'qth', label: 'QTH' },
  { key: 'rmks1', label: 'Rmks1' },
  { key: 'rmks2', label: 'Rmks2' },
]

const FIELD_HINT: Record<(typeof HAMLOG_FIELDS)[number], MessageKey> = {
  '{myref}': 'settings.hamlog.myref',
  '{hisref}': 'settings.hamlog.hisref',
  '{memo}': 'settings.hamlog.memo',
  '{rmks}': 'settings.hamlog.rmks',
  '{qslmsg}': 'settings.hamlog.qslmsg',
  '{rig}': 'settings.hamlog.rig',
}

/** HAMLOG の QTH・Rmks1・Rmks2 の欄に、何を書くか(書式に値を差し込む)。既定は旧 HamLogConv と同じ */
export function HamlogColumnsSection({ value, onChange }: Props) {
  const t = useT()
  const isDefault = COLUMNS.every(({ key }) => value[key] === DEFAULT_HAMLOG_COLUMNS[key])
  return (
    <fieldset className="space-y-2">
      <legend className="label">{t('settings.hamlog')}</legend>
      {COLUMNS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-2">
          <label htmlFor={`hamlog-${key}`} className="w-16 flex-none font-semibold">
            {label}
          </label>
          <input
            id={`hamlog-${key}`}
            value={value[key]}
            maxLength={HAMLOG_COLUMN_MAX}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            className="input font-mono"
          />
        </div>
      ))}
      <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
        {HAMLOG_FIELDS.map((f) => (
          <li key={f}>
            <code className="font-mono font-bold">{f}</code> {t(FIELD_HINT[f])}
          </li>
        ))}
      </ul>
      <p className="text-sm text-gray-700 dark:text-gray-300">{t('settings.hamlog.hint')}</p>
      {!isDefault && (
        <button type="button" onClick={() => onChange(DEFAULT_HAMLOG_COLUMNS)} className="btn-secondary w-full">
          {t('settings.hamlog.reset')}
        </button>
      )}
    </fieldset>
  )
}
