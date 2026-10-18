import { useEffect, useRef } from 'react'
type Theme = 'light' | 'dark' | 'system'

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
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // 枠の外(暗い背景)をタップしたら閉じる
        if (e.target === ref.current) onClose()
      }}
      aria-labelledby="settings-title"
      className="w-[min(28rem,100%)] max-w-none mt-auto mb-0 sm:my-auto mx-auto p-0 rounded-t-2xl sm:rounded-2xl border-2 border-gray-300 dark:border-gray-700 bg-white text-gray-950 dark:bg-gray-900 dark:text-gray-50 backdrop:bg-black/60"
    >
      <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <h2 id="settings-title" className="text-xl font-bold mb-4">
          設定
        </h2>

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

        <button type="button" onClick={onClose} className="btn-primary w-full mt-4">
          閉じる
        </button>
      </div>
    </dialog>
  )
}
