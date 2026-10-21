import { useState } from 'react'
import {
  activeLayout,
  TIMEZONE_MAX,
  TIMEZONE_MIN,
  timezoneLabel,
  touchDevice,
  type EditorFont,
  type Layout,
  type QsoCount,
  type Settings,
  type Theme,
} from '@/hooks/useSettings'
import { Sheet } from '@/components/Sheet'
import { parseRigs } from '@/lib/rig'
import { SyncSection } from '@/components/SyncSection'
import type { useSync } from '@/hooks/useSync'
import { useT, type MessageKey } from '@/lib/i18n'

const THEME_OPTIONS: { value: Theme; label: MessageKey; hint: MessageKey }[] = [
  { value: 'system', label: 'settings.theme.system', hint: 'settings.theme.system.hint' },
  { value: 'light', label: 'settings.theme.light', hint: 'settings.theme.light.hint' },
  { value: 'dark', label: 'settings.theme.dark', hint: 'settings.theme.dark.hint' },
]

const FONT_OPTIONS: { value: EditorFont; label: MessageKey; hint: MessageKey }[] = [
  { value: 'mono', label: 'settings.editorFont.mono', hint: 'settings.editorFont.mono.hint' },
  { value: 'gothic', label: 'settings.editorFont.gothic', hint: 'settings.editorFont.gothic.hint' },
]

const COUNT_OPTIONS: { value: QsoCount; label: MessageKey; hint: MessageKey }[] = [
  { value: 'day', label: 'settings.qsoCount.day', hint: 'settings.qsoCount.day.hint' },
  { value: 'total', label: 'settings.qsoCount.total', hint: 'settings.qsoCount.total.hint' },
]

const LAYOUT_OPTIONS: { value: Layout; label: MessageKey; hint: MessageKey }[] = [
  { value: 'classic', label: 'settings.layout.classic', hint: 'settings.layout.classic.hint' },
  { value: 'fullkey', label: 'settings.layout.fullkey', hint: 'settings.layout.fullkey.hint' },
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
  /** 設定・予定の同期 */
  sync: ReturnType<typeof useSync>
}

export function SettingsDialog({ open, onClose, settings, onChange, sync }: Props) {
  const t = useT()
  const [touch] = useState(touchDevice)
  // PC でフルキーが選ばれていたら、実際に動いている従来として見せる
  const layout = activeLayout(settings.layout, touch)
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

        <label className="flex items-start gap-3 p-3 min-h-14 rounded-xl border-2 border-gray-300 dark:border-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoTime}
            onChange={(e) => onChange({ autoTime: e.target.checked })}
            className="mt-1 w-5 h-5 accent-primary-700"
          />
          <span>
            <span className="block font-semibold">{t('settings.autoTime')}</span>
            <span className="block text-sm text-gray-700 dark:text-gray-300">{t('settings.autoTime.hint')}</span>
          </span>
        </label>

        <fieldset className="space-y-2">
          <legend className="label">{t('settings.confirm')}</legend>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('settings.confirm.intro')}
          </p>
          {CONFIRM_OPTIONS.map((opt) => {
            // RST は配置ごとに持つ(従来の配置は、リリース版の設定のまま)
            const key = opt.key === 'writeRst' && layout === 'fullkey' ? 'writeRstCompact' : opt.key
            return (
              <label
                key={opt.key}
                className="flex items-start gap-3 p-3 min-h-14 rounded-xl border-2 border-gray-300 dark:border-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) => onChange({ [key]: e.target.checked })}
                  className="mt-1 w-5 h-5 accent-primary-700"
                />
                <span>
                  <span className="block font-semibold">{t(opt.label)}</span>
                  <span className="block text-sm text-gray-700 dark:text-gray-300">{t(opt.hint)}</span>
                  {opt.key === 'writeRst' && (
                    // 配置ごとの設定なので、どの配置の設定かを添える(別の配置で変えても、ここには効かない)
                    <span className="block mt-1 text-sm font-bold text-primary-700 dark:text-primary-300">
                      {t(layout === 'classic' ? 'settings.confirm.rst.classic' : 'settings.confirm.rst.compact')}
                    </span>
                  )}
                </span>
              </label>
            )
          })}
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

        <fieldset className="space-y-2">
          <legend className="label">{t('settings.layout')}</legend>
          {LAYOUT_OPTIONS.map((opt) => {
            // フルキーは、タッチ端末でだけ選べる(PC では、物理キーボードがあるので要らない)
            const unavailable = opt.value === 'fullkey' && !touch
            return (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-3 min-h-14 rounded-xl border-2 ${
                  unavailable ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                } ${
                  layout === opt.value
                    ? 'border-primary-700 bg-primary-50 dark:border-primary-400 dark:bg-gray-800'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
              >
                <input
                  type="radio"
                  name="layout"
                  value={opt.value}
                  checked={layout === opt.value}
                  disabled={unavailable}
                  onChange={() => onChange({ layout: opt.value })}
                  className="mt-1 w-5 h-5 accent-primary-700"
                />
                <span>
                  <span className="block font-semibold">{t(opt.label)}</span>
                  <span className="block text-sm text-gray-700 dark:text-gray-300">
                    {t(unavailable ? 'settings.layout.fullkey.touchOnly' : opt.hint)}
                  </span>
                </span>
              </label>
            )
          })}
        </fieldset>

        {layout === 'fullkey' && (
          <label className="flex items-start gap-3 p-3 min-h-14 rounded-xl border-2 border-gray-300 dark:border-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showClock}
              onChange={(e) => onChange({ showClock: e.target.checked })}
              className="mt-1 w-5 h-5 accent-primary-700"
            />
            <span>
              <span className="block font-semibold">{t('settings.showClock')}</span>
              <span className="block text-sm text-gray-700 dark:text-gray-300">{t('settings.showClock.hint')}</span>
            </span>
          </label>
        )}

        <fieldset className="space-y-2">
          <legend className="label">{t('settings.editorFont')}</legend>
          {FONT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 min-h-14 rounded-xl border-2 cursor-pointer ${
                settings.editorFont === opt.value
                  ? 'border-primary-700 bg-primary-50 dark:border-primary-400 dark:bg-gray-800'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
            >
              <input
                type="radio"
                name="editorFont"
                value={opt.value}
                checked={settings.editorFont === opt.value}
                onChange={() => onChange({ editorFont: opt.value })}
                className="mt-1 w-5 h-5 accent-primary-700"
              />
              <span>
                <span className={`block font-semibold ${opt.value === 'mono' ? 'font-mono' : ''}`}>{t(opt.label)}</span>
                <span className="block text-sm text-gray-700 dark:text-gray-300">{t(opt.hint)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="label">{t('settings.qsoCount')}</legend>
          {COUNT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 min-h-14 rounded-xl border-2 cursor-pointer ${
                settings.qsoCount === opt.value
                  ? 'border-primary-700 bg-primary-50 dark:border-primary-400 dark:bg-gray-800'
                  : 'border-gray-300 dark:border-gray-700'
              }`}
            >
              <input
                type="radio"
                name="qsoCount"
                value={opt.value}
                checked={settings.qsoCount === opt.value}
                onChange={() => onChange({ qsoCount: opt.value })}
                className="mt-1 w-5 h-5 accent-primary-700"
              />
              <span>
                <span className="block font-semibold">{t(opt.label)}</span>
                <span className="block text-sm text-gray-700 dark:text-gray-300">{t(opt.hint)}</span>
              </span>
            </label>
          ))}
        </fieldset>

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

        <SyncSection sync={sync} />
      </div>
    </Sheet>
  )
}
