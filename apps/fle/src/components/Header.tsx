import { useState } from 'react'
import { Cog, Download, Ellipsis } from 'lucide-react'
import type { Settings } from '@/hooks/useSettings'
import { SettingsDialog } from '@/components/SettingsDialog'

interface Props {
  onGenerate: () => void
  canGenerate: boolean
  onMenu: () => void
  /** 新しい版がある(メニューに印を付ける) */
  updateReady: boolean
  settings: Settings
  onSettingsChange: (patch: Partial<Settings>) => void
}

export function Header({ onGenerate, canGenerate, onMenu, updateReady, settings, onSettingsChange }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <header className="flex-none flex items-center justify-between h-12 pt-[env(safe-area-inset-top)] box-content">
      <h1 className="text-lg font-bold">FLEonline</h1>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          aria-label="ファイル生成"
          className="btn-success !min-h-11 !px-3.5"
        >
          <Download className="w-5 h-5" />
          生成
        </button>
        <button
          type="button"
          onClick={onMenu}
          aria-label={updateReady ? 'メニュー(新しい版があります)' : 'メニュー'}
          className="btn-secondary !min-h-11 !min-w-11 !px-0 relative"
        >
          <Ellipsis className="w-6 h-6" />
          {updateReady && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-600 border-2 border-white dark:border-gray-950"
            />
          )}
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="設定"
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
      />
    </header>
  )
}
