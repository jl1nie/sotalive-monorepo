import { Header } from '@/components/Header'
import { FleEditor } from '@/components/FleEditor'

function App() {
  return (
    <div className="min-h-dvh bg-white dark:bg-gray-950">
      <Header />
      <main className="p-4 pb-0">
        <FleEditor />
      </main>
    </div>
  )
}

export default App
