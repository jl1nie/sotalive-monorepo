import { useState } from 'react'
import type { TabId } from '@/types/form'
import { FileText, Mountain, Radio, Activity, PenLine } from 'lucide-react'

interface Tab {
  id: TabId
  label: string
  shortLabel: string
  icon: React.ReactNode
}

const tabs: Tab[] = [
  {
    id: 'pota-activator',
    label: 'SOTA/JAFF/POTA ADIF',
    shortLabel: 'ADIF',
    icon: <FileText className="w-6 h-6" />,
  },
  {
    id: 'sota-activator',
    label: 'SOTA Activator',
    shortLabel: 'Activator',
    icon: <Mountain className="w-6 h-6" />,
  },
  {
    id: 'sota-chaser',
    label: 'SOTA Chaser',
    shortLabel: 'Chaser',
    icon: <Radio className="w-6 h-6" />,
  },
  { id: 'wspr', label: 'WSPRnet SNR', shortLabel: 'WSPR', icon: <Activity className="w-6 h-6" /> },
  { id: 'fle', label: 'FLE Online', shortLabel: 'FLE', icon: <PenLine className="w-6 h-6" /> },
]

/** 旧版の logconv は、FLE Online をタブ(#FLEOnline)で持っていた。そのリンクで来た人には、このタブを開く */
const initialTab = (): TabId => (location.hash === '#FLEOnline' ? 'fle' : 'pota-activator')

interface TabContainerProps {
  children: (activeTab: TabId) => React.ReactNode
}

export function TabContainer({ children }: TabContainerProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  return (
    <div className="w-full">
      {/* PC・タブレット: 上部タブ */}
      <nav
        className="hidden md:flex gap-1 px-6 border-b-2 border-gray-300 dark:border-gray-700"
        aria-label="機能"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2 px-4 min-h-12 -mb-0.5 text-base font-semibold whitespace-nowrap border-b-4 ${
                active
                  ? 'border-primary-700 text-primary-800 dark:border-primary-400 dark:text-primary-300'
                  : 'border-transparent text-gray-700 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white'
              }`}
            >
              <span className="[&>svg]:w-5 [&>svg]:h-5">{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </nav>

      <div className="p-4 sm:p-6 pb-6">{children(activeTab)}</div>

      {/* スマホ: 親指で押せる下部ナビ */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white dark:bg-gray-950 border-t-2 border-gray-300 dark:border-gray-700 pb-[env(safe-area-inset-bottom)]"
        aria-label="機能"
      >
        <ul className="grid grid-cols-5">
          {tabs.map((tab) => {
            const active = activeTab === tab.id
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full min-h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold border-t-4 ${
                    active
                      ? 'border-primary-700 text-primary-800 bg-primary-50 dark:border-primary-400 dark:text-primary-200 dark:bg-gray-900'
                      : 'border-transparent text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {tab.icon}
                  {tab.shortLabel}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
