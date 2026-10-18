import { useCallback, useState } from 'react'
import { gridLocator } from '@/lib/fle'

/**
 * ブラウザの位置情報から、グリッドロケータを求める。
 * 位置情報の取得は画面(端末)の役目で、グリッドの計算はコアに任せる。
 */
export function useGridLocate(onLocated: (grid: string, position: GeolocationPosition) => void) {
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const locate = useCallback(() => {
    setMessage(null)
    if (!navigator.geolocation) {
      setMessage('この端末では位置情報を使えません')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const grid = await gridLocator(pos.coords.latitude, pos.coords.longitude)
        if (grid) onLocated(grid, pos)
        else setMessage('位置からグリッドを求められませんでした')
        setLocating(false)
      },
      () => {
        setMessage('位置情報を取得できませんでした。ブラウザの許可を確認してください')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  }, [onLocated])

  return { locate, locating, message }
}
