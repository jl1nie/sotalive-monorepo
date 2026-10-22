import { createContext, useContext } from 'react'

/**
 * フルキーの配置で、シートの入力欄(自局・リファレンス・グリッド)にも、画面のキーボードを使う。
 * 日本語を書く欄(メモ・予定の名前など)は、OS のキーボードのまま。
 */
interface FieldKeys {
  /** 入力欄に画面のキーボードを使うか(フルキーの配置) */
  enabled: boolean
  /** 🌐 で、OS のキーボードに切り替えている */
  os: boolean
  setOs: (os: boolean) => void
  keyScale: number
  onKeyScale: (scale: number) => void
}

export const FieldKeysContext = createContext<FieldKeys>({
  enabled: false,
  os: false,
  setOs: () => {},
  keyScale: 1,
  onKeyScale: () => {},
})

/** 画面のキーボードで打つ入力欄に付ける属性(OS のキーボードを出さない) */
export function useFieldKeyProps() {
  const { enabled, os } = useContext(FieldKeysContext)
  return { 'data-fle-keys': '', inputMode: enabled && !os ? ('none' as const) : undefined }
}
