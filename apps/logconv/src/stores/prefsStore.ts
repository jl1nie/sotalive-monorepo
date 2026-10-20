import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { MyQTHOption, HisQTHOption } from '@/types/form'

interface PrefsState {
  // Theme
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void

  // POTA/JAFF/SOTA ADIF (main tab)
  potaActivationCall: string
  potaOperator: string
  potaPark: string
  myQTHPota: MyQTHOption
  actQTHPota: HisQTHOption

  // SOTA Activator
  sotaActivationCall: string
  sotaSummit: string
  myQTHSota: MyQTHOption
  actQTHSota: HisQTHOption

  // SOTA Chaser
  chaserCall: string
  hisQTHChaser: HisQTHOption

  // Actions - POTA
  setPotaActivationCall: (call: string) => void
  setPotaOperator: (operator: string) => void
  setPotaPark: (park: string) => void
  setMyQTHPota: (qth: MyQTHOption) => void
  setActQTHPota: (qth: HisQTHOption) => void

  // Actions - SOTA Activator
  setSotaActivationCall: (call: string) => void
  setSotaSummit: (summit: string) => void
  setMyQTHSota: (qth: MyQTHOption) => void
  setActQTHSota: (qth: HisQTHOption) => void

  // Actions - SOTA Chaser
  setChaserCall: (call: string) => void
  setHisQTHChaser: (qth: HisQTHOption) => void
}

// localStorage が使えない(容量超過・プライベートモードなど)ときも、例外を出さない
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      // 保存できなくても、画面の状態は更新される
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // 同上
    }
  },
}

const STRING_KEYS = [
  'potaActivationCall',
  'potaOperator',
  'potaPark',
  'sotaActivationCall',
  'sotaSummit',
  'chaserCall',
] as const

const CHOICES: Record<string, readonly string[]> = {
  theme: ['light', 'dark', 'system'],
  myQTHPota: ['form', 'rmks1', 'rmks2'],
  myQTHSota: ['form', 'rmks1', 'rmks2'],
  actQTHPota: ['none', 'rmks1', 'rmks2', 'qth'],
  actQTHSota: ['none', 'rmks1', 'rmks2', 'qth'],
  hisQTHChaser: ['rmks1', 'rmks2', 'qth'],
}

/** 保存した値を確かめる。文字列でない値・知らない選択肢は捨てて、既定のままにする */
function sanitize(persisted: unknown): Partial<PrefsState> {
  if (typeof persisted !== 'object' || persisted === null || Array.isArray(persisted)) return {}
  const src = persisted as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of STRING_KEYS) {
    if (typeof src[key] === 'string') out[key] = src[key]
  }
  for (const [key, allowed] of Object.entries(CHOICES)) {
    if (typeof src[key] === 'string' && allowed.includes(src[key])) out[key] = src[key]
  }
  return out as Partial<PrefsState>
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      // Theme
      theme: 'system',
      setTheme: (theme) => set({ theme }),

      // POTA defaults
      potaActivationCall: '',
      potaOperator: '',
      potaPark: '',
      myQTHPota: 'form',
      actQTHPota: 'none',

      // SOTA Activator defaults
      sotaActivationCall: '',
      sotaSummit: '',
      myQTHSota: 'form',
      actQTHSota: 'none',

      // SOTA Chaser defaults
      chaserCall: '',
      hisQTHChaser: 'rmks1',

      // Actions - POTA
      setPotaActivationCall: (call) => set({ potaActivationCall: call }),
      setPotaOperator: (operator) => set({ potaOperator: operator }),
      setPotaPark: (park) => set({ potaPark: park }),
      setMyQTHPota: (qth) => set({ myQTHPota: qth }),
      setActQTHPota: (qth) => set({ actQTHPota: qth }),

      // Actions - SOTA Activator
      setSotaActivationCall: (call) => set({ sotaActivationCall: call }),
      setSotaSummit: (summit) => set({ sotaSummit: summit }),
      setMyQTHSota: (qth) => set({ myQTHSota: qth }),
      setActQTHSota: (qth) => set({ actQTHSota: qth }),

      // Actions - SOTA Chaser
      setChaserCall: (call) => set({ chaserCall: call }),
      setHisQTHChaser: (qth) => set({ hisQTHChaser: qth }),
    }),
    {
      name: 'logconv-prefs',
      storage: createJSONStorage(() => safeStorage),
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
    }
  )
)
