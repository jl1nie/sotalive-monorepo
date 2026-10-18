import { useCallback, useEffect, useRef, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type { LangPref } from '@/lib/errors'
import type { LangPref } from '@/lib/errors'

export interface Settings {
  theme: Theme
  /** 既定のタイムゾーン(UTCからの時間差。UTC は 0) */
  timezone: number
  /** 確定ボタンで、バンド・モードも書く(時刻は常に書く) */
  writeBandMode: boolean
  /** 確定ボタンで、RSTも書く(省略した 599/59 や、4 のような省略形も) */
  writeRst: boolean
  /** 誤りの文面の言語(auto は端末の言語) */
  language: LangPref
}

export const TIMEZONE_MIN = -12
export const TIMEZONE_MAX = 14

const KEY = 'fle.settings'
const DEFAULTS: Settings = { theme: 'system', timezone: 0, writeBandMode: false, writeRst: true, language: 'auto' }

function load(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const theme: Theme = v.theme === 'light' || v.theme === 'dark' ? v.theme : 'system'
    const timezone =
      Number.isInteger(v.timezone) && v.timezone >= TIMEZONE_MIN && v.timezone <= TIMEZONE_MAX
        ? v.timezone
        : 0
    return {
      theme,
      timezone,
      writeBandMode: typeof v.writeBandMode === 'boolean' ? v.writeBandMode : DEFAULTS.writeBandMode,
      writeRst: typeof v.writeRst === 'boolean' ? v.writeRst : DEFAULTS.writeRst,
      language: v.language === 'ja' || v.language === 'en' ? v.language : 'auto',
    }
  } catch {
    return DEFAULTS
  }
}

/** 設定の読み書きと、テーマの反映。初期値は、端末のテーマに合わせ、時刻はUTC。 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load)
  const current = useRef(settings)

  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...current.current, ...patch }
    current.current = next
    setSettings(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // 保存できなくても動作には影響しない
    }
  }, [])

  const { theme } = settings
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

  return { settings, update }
}

/** 設定画面の表示用。0 は「UTC」、9 は日本標準時を添える。 */
export function timezoneLabel(tz: number): string {
  if (tz === 0) return 'UTC(世界標準時)'
  const base = `UTC${tz > 0 ? '+' : '-'}${Math.abs(tz)}`
  return tz === 9 ? `${base}(日本標準時)` : base
}
