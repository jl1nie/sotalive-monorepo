import { useCallback, useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** Chrome系が出すインストール案内のイベント(標準の型定義がない) */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

/** iPhone/iPad は案内のイベントが無く、共有メニューから追加する */
function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/**
 * Service Worker(オフライン・更新)とインストールの状態。
 * 新しい版は、入力中に勝手に再読み込みしないよう、利用者が押したときだけ適用する。
 */
export function usePwa(onOfflineReady: () => void) {
  const [updateReady, setUpdateReady] = useState(false)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const applyRef = useRef<(reload?: boolean) => Promise<void>>(undefined)

  useEffect(() => {
    // 開発サーバーでは Service Worker を使わない
    if (!import.meta.env.PROD) return
    applyRef.current = registerSW({
      onNeedRefresh: () => setUpdateReady(true),
      onOfflineReady,
    })
  }, [onOfflineReady])

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault() // 自前のボタンから出す
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstallEvent(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!installEvent) return
    await installEvent.prompt()
    setInstallEvent(null)
  }, [installEvent])

  const applyUpdate = useCallback(() => applyRef.current?.(true), [])

  return {
    updateReady,
    applyUpdate,
    canInstall: installEvent !== null,
    install,
    /** iPhone/iPad で、まだホーム画面に追加していない */
    showIosHint: isIos() && !isStandalone(),
  }
}
