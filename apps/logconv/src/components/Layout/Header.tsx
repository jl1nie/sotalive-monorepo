import { useState } from 'react'
import { Cog } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { SettingsDialog } from '@/components/Layout/SettingsDialog'

export function Header() {
  const { theme, setTheme } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-gray-950 border-b-2 border-gray-300 dark:border-gray-700 pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
        <div className="flex items-center gap-3 min-w-0">
          <div
            aria-hidden="true"
            className="w-9 h-9 shrink-0 bg-primary-700 rounded-lg flex items-center justify-center"
          >
            <span className="text-white font-bold">LC</span>
          </div>
          <h1 className="text-lg font-bold truncate">Log Converter</h1>
          <span className="hidden sm:inline text-sm text-gray-700 dark:text-gray-300">
            for SOTA / JAFF / POTA
          </span>
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="btn-secondary !min-h-11 !min-w-11 !px-0"
          aria-label="設定"
        >
          <Cog className="w-6 h-6" />
        </button>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
      />
    </header>
  )
}
