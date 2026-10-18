import { useMemo, type ReactNode } from 'react'
import { I18nContext, translator, type Lang } from '@/lib/i18n'

/** 画面全体に、表示言語と翻訳の関数を渡す */
export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: translator(lang) }), [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
