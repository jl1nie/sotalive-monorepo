import { useEffect } from 'react'

/**
 * ソフトキーボードが出て見える領域が縮んでも、画面下の部品が隠れないように、
 * 見えている高さと上端の位置をCSS変数(--vvh / --vvt)に反映する。
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const style = document.documentElement.style
    const update = () => {
      style.setProperty('--vvh', `${vv.height}px`)
      style.setProperty('--vvt', `${vv.offsetTop}px`)
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
}
