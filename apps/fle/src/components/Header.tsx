import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

const THEME_LABEL = { light: 'ライト', dark: 'ダーク', system: '自動' } as const

export function Header() {
  const { theme, toggleTheme } = useTheme()
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-gray-950 border-b-2 border-gray-300 dark:border-gray-700 pt-[env(safe-area-inset-top)]">
      <div className="max-w-3xl md:max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <h1 className="text-lg font-bold">FLE Online</h1>
        <button
          type="button"
          onClick={toggleTheme}
          className="btn-secondary !min-h-11 !px-3"
          aria-label={`表示テーマ: ${THEME_LABEL[theme]}(押すと切り替え)`}
        >
          <Icon className="w-5 h-5" />
          <span className="text-sm">{THEME_LABEL[theme]}</span>
        </button>
      </div>
    </header>
  )
}
