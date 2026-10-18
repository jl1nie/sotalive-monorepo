import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const KEY = 'fle-theme'
const ORDER: Theme[] = ['light', 'dark', 'system']

function load(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'light'
  } catch {
    return 'light'
  }
}

/** 屋外での視認性を優先して、初期値はライト。 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(load)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches))
    apply()
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // 保存できなくても動作には影響しない
    }
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const toggleTheme = useCallback(
    () => setTheme((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length]),
    []
  )

  return { theme, toggleTheme }
}
