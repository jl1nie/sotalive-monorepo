import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

export function Header() {
  const { theme, toggleTheme } = useTheme()

  const getThemeIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="w-5 h-5" />
      case 'dark':
        return <Moon className="w-5 h-5" />
      default:
        return <Monitor className="w-5 h-5" />
    }
  }

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-accent-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">LC</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Log Converter
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                for SOTA / JAFF / POTA
              </p>
            </div>
          </div>
          
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title={`Theme: ${theme}`}
          >
            {getThemeIcon()}
          </button>
        </div>
      </div>
    </header>
  )
}
