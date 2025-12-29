import { Header } from '@/components/Layout/Header'
import {
  TabContainer,
  POTAActivatorTab,
  SOTAActivatorTab,
  SOTAChaserTab,
  FLEOnlineTab,
  AirHamLogTab,
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
      case 'fle-online':
        return <FLEOnlineTab />
      case 'airhamlog':
        return <AirHamLogTab />
      case 'wspr':
        return <WSPRTab />
      default:
        return <POTAActivatorTab />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <Header />
      <main className="max-w-7xl mx-auto">
        <TabContainer>
          {renderTab}
        </TabContainer>
      </main>
      
      <footer className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>Log Converter for SOTA / JAFF / POTA</p>
        <p className="mt-1">
          <a 
            href="https://sotalive.net" 
            className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            sotalive.net
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App
