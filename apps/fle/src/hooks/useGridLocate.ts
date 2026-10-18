import { useCallback, useState } from 'react'
import { gridLocator } from '@/lib/fle'
import { useT, type MessageKey } from '@/lib/i18n'

/**
 * ブラウザの位置情報から、グリッドロケータを求める。
 * 位置情報の取得は画面(端末)の役目で、グリッドの計算はコアに任せる。
 */
export function useGridLocate(onLocated: (grid: string, position: GeolocationPosition) => void) {
  const [locating, setLocating] = useState(false)
  const t = useT()
  const [messageKey, setMessage] = useState<MessageKey | null>(null)

  const locate = useCallback(() => {
    setMessage(null)
    if (!navigator.geolocation) {
      setMessage('geo.unsupported')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const grid = await gridLocator(pos.coords.latitude, pos.coords.longitude)
        if (grid) onLocated(grid, pos)
        else setMessage('geo.noGrid')
        setLocating(false)
      },
      () => {
        setMessage('geo.denied')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  }, [onLocated])

  return { locate, locating, message: messageKey ? t(messageKey) : null }
}
