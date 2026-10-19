import { useState } from 'react'
import { Cog, Ellipsis } from 'lucide-react'
import type { Settings } from '@/hooks/useSettings'
import type { useSync } from '@/hooks/useSync'
import { SettingsDialog } from '@/components/SettingsDialog'
import { useT } from '@/lib/i18n'

interface Props {
  onMenu: () => void
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
  sync: ReturnType<typeof useSync>
}

export function Header({ onMenu, settings, onSettingsChange, sync }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const t = useT()

  return (
    <header className="flex-none flex items-center justify-between h-12 pt-[env(safe-area-inset-top)] box-content">
      <h1 className="text-lg font-bold">FLEonline</h1>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMenu}
          aria-label={t('header.menu')}
          className="btn-secondary !min-h-11 !min-w-11 !px-0"
        >
          <Ellipsis className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label={t('header.settings')}
          className="btn-secondary !min-h-11 !min-w-11 !px-0"
        >
          <Cog className="w-6 h-6" />
        </button>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={onSettingsChange}
        sync={sync}
      />
    </header>
  )
}
