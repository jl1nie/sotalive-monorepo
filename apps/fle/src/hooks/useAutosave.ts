import { useCallback, useEffect, useRef } from 'react'
import { saveLog } from '@/lib/storage'

const DEBOUNCE_MS = 400

/**
 * 入力のたびに少し待って保存し、画面を離れる(バックグラウンド・終了)ときは即座に保存する。
 * 保存できないときは、最初の1回だけ onError で知らせる。
 */
export function useAutosave(text: string, onError: () => void) {
  const latest = useRef(text)
  const failed = useRef(false)

  useEffect(() => {
    latest.current = text
  }, [text])

  const flush = useCallback(() => {
    if (saveLog(latest.current)) {
      failed.current = false
    } else if (!failed.current) {
      failed.current = true
      onError()
    }
  }, [onError])

  useEffect(() => {
    const timer = window.setTimeout(flush, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [text, flush])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [flush])

  // ブラウザの容量不足でも消されにくいよう、保存領域の永続化を一度だけ頼む(断られても問題ない)
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {})
  }, [])
}
