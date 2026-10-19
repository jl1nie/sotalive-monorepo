import { useEffect, useState } from 'react'

/** 見える高さが、ページの高さよりこれ以上低ければ、ソフトキーボードが出ているとみなす(px) */
const KEYBOARD_MIN = 120

/**
 * ソフトキーボードが出て見える領域が縮んでも、画面下の部品が隠れないように、
 * 見えている高さと上端の位置をCSS変数(--vvh / --vvt)に反映する。
 * ソフトキーボードが出ているかを返す(出ている間は、ホームバーの分の余白が要らない)。
 */
export function useVisualViewport(): boolean {
  const [keyboard, setKeyboard] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const style = document.documentElement.style
    const update = () => {
      style.setProperty('--vvh', `${vv.height}px`)
      style.setProperty('--vvt', `${vv.offsetTop}px`)
      // ページ(レイアウト)の高さは、キーボードが出ても変わらない(iOS・Android の既定)
      setKeyboard(document.documentElement.clientHeight - vv.height * vv.scale > KEYBOARD_MIN)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      style.removeProperty('--vvh')
      style.removeProperty('--vvt')
    }
  }, [])
  return keyboard
}
