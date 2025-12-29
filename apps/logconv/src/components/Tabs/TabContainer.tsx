import { useState } from 'react'
import type { TabId } from '@/types/form'
import { FileText, Mountain, Radio, Edit3, Smartphone, Activity } from 'lucide-react'

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
    icon: <FileText className="w-4 h-4" />
  },
  { 
    id: 'sota-activator', 
    label: 'SOTA Activator', 
    shortLabel: 'Activator',
    icon: <Mountain className="w-4 h-4" />
  },
  { 
    id: 'sota-chaser', 
    label: 'SOTA Chaser', 
    shortLabel: 'Chaser',
    icon: <Radio className="w-4 h-4" />
  },
  { 
    id: 'fle-online', 
    label: 'FLE Online', 
    shortLabel: 'FLE',
    icon: <Edit3 className="w-4 h-4" />
  },
  { 
    id: 'airhamlog', 
    label: 'AirHamLog', 
    shortLabel: 'AirHam',
    icon: <Smartphone className="w-4 h-4" />
  },
  { 
    id: 'wspr', 
    label: 'WSPRnet SNR', 
    shortLabel: 'WSPR',
    icon: <Activity className="w-4 h-4" />
  },
]

interface TabContainerProps {
  children: (activeTab: TabId) => React.ReactNode
}

export function TabContainer({ children }: TabContainerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('pota-activator')

  return (
    <div className="w-full">
      {/* Tab navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1 overflow-x-auto px-4 -mb-px" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
                border-b-2 transition-all duration-200
                ${activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="p-4 sm:p-6">
        {children(activeTab)}
      </div>
    </div>
  )
}
