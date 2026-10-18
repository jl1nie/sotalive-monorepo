import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

const KEY = 'fle.settings'

function load(): Theme {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}').theme
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** 初期値は端末の設定に合わせる。選んだときだけ保存する。 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(load)

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(KEY, JSON.stringify({ theme: t }))
    } catch {
      // 保存できなくても動作には影響しない
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () =>
      root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches))
    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  return { theme, setTheme }
}
