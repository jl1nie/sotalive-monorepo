import type { Theme } from '@/hooks/useTheme'
import { Sheet } from '@/components/Sheet'

const THEME_OPTIONS: { value: Theme; label: string; hint: string }[] = [
  { value: 'system', label: '端末に合わせる', hint: '端末の明るい/暗いの設定に従います' },
  { value: 'light', label: 'ライト', hint: '屋外・日なたで見やすい' },
  { value: 'dark', label: 'ダーク', hint: '夜間や暗い場所向け' },
]

interface Props {
  open: boolean
  onClose: () => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
}

export function SettingsDialog({ open, onClose, theme, onThemeChange }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="設定">
      <fieldset className="space-y-2">
        <legend className="label">表示テーマ</legend>
        {THEME_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 p-3 min-h-14 rounded-xl border-2 cursor-pointer ${
              theme === opt.value
                ? 'border-primary-700 bg-primary-50 dark:border-primary-400 dark:bg-gray-800'
                : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            <input
              type="radio"
              name="theme"
              value={opt.value}
              checked={theme === opt.value}
              onChange={() => onThemeChange(opt.value)}
              className="mt-1 w-5 h-5 accent-primary-700"
            />
            <span>
              <span className="block font-semibold">{opt.label}</span>
              <span className="block text-sm text-gray-700 dark:text-gray-300">{opt.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Sheet>
  )
}
