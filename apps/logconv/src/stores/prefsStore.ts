import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      // Theme
      theme: 'light',
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
    }
  )
)
