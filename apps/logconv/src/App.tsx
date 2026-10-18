import { Header } from '@/components/Layout/Header'
import {
  TabContainer,
  POTAActivatorTab,
  SOTAActivatorTab,
  SOTAChaserTab,
  WSPRTab,
} from '@/components/Tabs'
import type { TabId } from '@/types/form'

function App() {
  const renderTab = (activeTab: TabId) => {
    switch (activeTab) {
      case 'pota-activator':
        return <POTAActivatorTab />
      case 'sota-activator':
        return <SOTAActivatorTab />
      case 'sota-chaser':
        return <SOTAChaserTab />
      case 'wspr':
        return <WSPRTab />
      default:
        return <POTAActivatorTab />
    }
  }

  return (
    <div className="min-h-dvh bg-white dark:bg-gray-950">
      <Header />
      <main className="max-w-7xl mx-auto">
        <TabContainer>
          {renderTab}
        </TabContainer>
      </main>
      
      <footer className="py-6 pb-28 md:pb-6 text-center text-sm text-gray-700 dark:text-gray-300">
        <p>Log Converter for SOTA / JAFF / POTA</p>
        <p className="mt-1">
          <a 
            href="https://sotalive.net" 
            className="inline-flex items-center min-h-11 px-3 underline text-primary-800 dark:text-primary-300"
          >
            sotalive.net
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App
