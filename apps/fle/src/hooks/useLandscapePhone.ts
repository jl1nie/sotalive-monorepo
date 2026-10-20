import { useEffect, useState } from 'react'
import { touchDevice } from '@/hooks/useSettings'

/** 画面の短い辺がこれより小さければ、スマホとみなす(タブレットの横向きは、そのまま使える) */
const PHONE_MAX = 600

/**
 * スマホが横向きか。見えている領域の縦横ではなく、端末の向きで見る
 * (縦向きでも、キーボードが出ると、見えている領域は横長になる)
 */
function landscapePhone(): boolean {
  if (!touchDevice()) return false
  if (Math.min(window.screen.width, window.screen.height) >= PHONE_MAX) return false
  const type = window.screen.orientation?.type
  if (type) return type.startsWith('landscape')
  return Math.abs(Number((window as { orientation?: number }).orientation ?? 0)) === 90
}

/** スマホが横向きか(向きが変わると、変わる) */
export function useLandscapePhone(): boolean {
  const [landscape, setLandscape] = useState(landscapePhone)
  useEffect(() => {
    const update = () => setLandscape(landscapePhone())
    window.screen.orientation?.addEventListener('change', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.screen.orientation?.removeEventListener('change', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
  return landscape
}
