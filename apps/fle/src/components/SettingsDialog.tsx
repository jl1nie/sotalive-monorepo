import {
  TIMEZONE_MAX,
  TIMEZONE_MIN,
  timezoneLabel,
  type Settings,
  type Theme,
} from '@/hooks/useSettings'
import { Sheet } from '@/components/Sheet'
import { parseRigs } from '@/lib/rig'
import { useT, type MessageKey } from '@/lib/i18n'

const THEME_OPTIONS: { value: Theme; label: MessageKey; hint: MessageKey }[] = [
  { value: 'system', label: 'settings.theme.system', hint: 'settings.theme.system.hint' },
  { value: 'light', label: 'settings.theme.light', hint: 'settings.theme.light.hint' },
  { value: 'dark', label: 'settings.theme.dark', hint: 'settings.theme.dark.hint' },
]

const CONFIRM_OPTIONS: { key: 'writeBandMode' | 'writeRst'; label: MessageKey; hint: MessageKey }[] = [
  { key: 'writeRst', label: 'settings.confirm.rst', hint: 'settings.confirm.rst.hint' },
  { key: 'writeBandMode', label: 'settings.confirm.bandMode', hint: 'settings.confirm.bandMode.hint' },
]

const TIMEZONES = Array.from({ length: TIMEZONE_MAX - TIMEZONE_MIN + 1 }, (_, i) => TIMEZONE_MIN + i)

interface Props {
  open: boolean
  onClose: () => void
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

export function SettingsDialog({ open, onClose, settings, onChange }: Props) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} title={t('settings.title')}>
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="label">{t('settings.theme')}</legend>
          {THEME_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 min-h-14 rounded-xl border-2 cursor-pointer ${
                settings.theme === opt.value
                  ? 'border-primary-700 bg-primary-50 dark:border-primary-400 dark:bg-gray-800'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={opt.value}
                checked={settings.theme === opt.value}
                onChange={() => onChange({ theme: opt.value })}
                className="mt-1 w-5 h-5 accent-primary-700"
              />
              <span>
                <span className="block font-semibold">{t(opt.label)}</span>
                <span className="block text-sm text-gray-700 dark:text-gray-300">{t(opt.hint)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="label">{t('settings.confirm')}</legend>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('settings.confirm.intro')}
          </p>
          {CONFIRM_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className="flex items-start gap-3 p-3 min-h-14 rounded-xl border-2 border-gray-300 dark:border-gray-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={settings[opt.key]}
                onChange={(e) => onChange({ [opt.key]: e.target.checked })}
                className="mt-1 w-5 h-5 accent-primary-700"
              />
              <span>
                <span className="block font-semibold">{t(opt.label)}</span>
                <span className="block text-sm text-gray-700 dark:text-gray-300">{t(opt.hint)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="flex items-start gap-3 p-3 min-h-14 rounded-xl border-2 border-gray-300 dark:border-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.digitRow}
            onChange={(e) => onChange({ digitRow: e.target.checked })}
            className="mt-1 w-5 h-5 accent-primary-700"
          />
          <span>
            <span className="block font-semibold">{t('settings.digitRow')}</span>
            <span className="block text-sm text-gray-700 dark:text-gray-300">{t('settings.digitRow.hint')}</span>
          </span>
        </label>

        <div>
          <label htmlFor="hamlog-time" className="label">
            {t('settings.hamlogTime')}
          </label>
          <select
            id="hamlog-time"
            value={settings.hamlogJst ? 'jst' : 'utc'}
            onChange={(e) => onChange({ hamlogJst: e.target.value === 'jst' })}
            className="input"
          >
            <option value="utc">UTC</option>
            <option value="jst">{t('settings.hamlogTime.jst')}</option>
          </select>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{t('settings.hamlogTime.hint')}</p>
        </div>

        <div>
          <label htmlFor="rigs" className="label">
            {t('settings.rigs')}
          </label>
          <textarea
            id="rigs"
            // 打っている途中の改行や空白を消さないよう、画面が持つ文字列を、そのまま見せる
            defaultValue={settings.rigs.join('\n')}
            onChange={(e) => onChange({ rigs: parseRigs(e.target.value) })}
            placeholder={t('settings.rigs.placeholder')}
            rows={3}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="input font-mono"
          />
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{t('settings.rigs.hint')}</p>
        </div>

        <div>
          <label htmlFor="language" className="label">
            {t('settings.language')}
          </label>
          <select
            id="language"
            value={settings.language}
            onChange={(e) => onChange({ language: e.target.value as Settings['language'] })}
            className="input"
          >
            <option value="auto">{t('settings.language.auto')}</option>
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </div>

        <div>
          <label htmlFor="timezone" className="label">
            {t('settings.timezone')}
          </label>
          <select
            id="timezone"
            value={settings.timezone}
            onChange={(e) => onChange({ timezone: Number(e.target.value) })}
            className="input"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {timezoneLabel(tz, t)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
            {t('settings.timezone.hint')}
          </p>
        </div>
      </div>
    </Sheet>
  )
}
