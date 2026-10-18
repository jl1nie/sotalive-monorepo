import {
  TIMEZONE_MAX,
  TIMEZONE_MIN,
  timezoneLabel,
  type Settings,
  type Theme,
} from '@/hooks/useSettings'
import { Sheet } from '@/components/Sheet'

const THEME_OPTIONS: { value: Theme; label: string; hint: string }[] = [
  { value: 'system', label: '端末に合わせる', hint: '端末の明るい/暗いの設定に従います' },
  { value: 'light', label: 'ライト', hint: '屋外・日なたで見やすい' },
  { value: 'dark', label: 'ダーク', hint: '夜間や暗い場所向け' },
]

const CONFIRM_OPTIONS: { key: 'writeBandMode' | 'writeRst'; label: string; hint: string }[] = [
  {
    key: 'writeRst',
    label: 'RST',
    hint: '省略したときの 599 / 59 も書きます。4 のような省略形は 549 のように直します',
  },
  {
    key: 'writeBandMode',
    label: 'バンド・モード',
    hint: '各行に 40m CW のように書きます。設定行で決めていれば、書かなくても同じ意味です',
  },
]

const TIMEZONES = Array.from({ length: TIMEZONE_MAX - TIMEZONE_MIN + 1 }, (_, i) => TIMEZONE_MIN + i)

interface Props {
  open: boolean
  onClose: () => void
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

export function SettingsDialog({ open, onClose, settings, onChange }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="設定">
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="label">表示テーマ</legend>
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
                <span className="block font-semibold">{opt.label}</span>
                <span className="block text-sm text-gray-700 dark:text-gray-300">{opt.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="label">確定の書き方</legend>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            緑の候補バーで確定するとき、時刻は必ず書きます。ほかに書くものを選べます。
            省略したままでも、意味は同じです(バーには、いつも完全な解釈が出ます)。
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
                <span className="block font-semibold">{opt.label}</span>
                <span className="block text-sm text-gray-700 dark:text-gray-300">{opt.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div>
          <label htmlFor="language" className="label">
            誤りの言語 / Error language
          </label>
          <select
            id="language"
            value={settings.language}
            onChange={(e) => onChange({ language: e.target.value as Settings['language'] })}
            className="input"
          >
            <option value="auto">端末に合わせる / Auto</option>
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </div>

        <div>
          <label htmlFor="timezone" className="label">
            既定のタイムゾーン
          </label>
          <select
            id="timezone"
            value={settings.timezone}
            onChange={(e) => onChange({ timezone: Number(e.target.value) })}
            className="input"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {timezoneLabel(tz)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
            時刻を自動で入れるとき、ログに timezone の指定がなければ、この時間帯で入れて、
            ログにも timezone の行を書き込みます。
          </p>
        </div>
      </div>
    </Sheet>
  )
}
