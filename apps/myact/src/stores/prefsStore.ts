import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Preferences, defaultPreferences } from '@/types/preferences';

interface PrefsStore extends Preferences {
  // Actions
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  resetPreferences: () => void;
}

export const usePrefsStore = create<PrefsStore>()(
  persist(
    (set) => ({
      ...defaultPreferences,

      setPreference: (key, value) =>
        set((state) => ({ ...state, [key]: value })),

      resetPreferences: () => set(defaultPreferences),
    }),
    {
      name: 'myact-prefs',
    }
  )
);
