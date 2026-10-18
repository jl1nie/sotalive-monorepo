import { useState } from 'react'
import { Cog } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { SettingsDialog } from '@/components/SettingsDialog'

export function Header() {
  const { theme, setTheme } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-gray-950 border-b-2 border-gray-300 dark:border-gray-700 pt-[env(safe-area-inset-top)]">
      <div className="max-w-3xl md:max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <h1 className="text-lg font-bold">FLE Online</h1>
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
