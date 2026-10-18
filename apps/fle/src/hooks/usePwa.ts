import { useCallback, useEffect, useRef, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** Chrome系が出すインストール案内のイベント(標準の型定義がない) */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

/** iPhone/iPad は案内のイベントが無く、共有メニューから追加する */
const OFFLINE_NOTICE_KEY = 'fle.offlineNoticeShown'

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
 * Service Worker(オフライン)とインストールの状態。
 * 画面はネットワーク優先で取るので、更新の適用を利用者に尋ねる必要はない(開き直せば最新)。
 */
export function usePwa(onOfflineReady: () => void) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  // 登録は1回だけ。通知は、そのときの言語で出す(最新の関数を参照する)
  const latest = useRef(onOfflineReady)
  useEffect(() => {
    latest.current = onOfflineReady
  })
  useEffect(() => {
    // 開発サーバーでは Service Worker を使わない
    if (!import.meta.env.PROD) return
    registerSW({
      onOfflineReady() {
        // 「使えます」は、この端末で最初の1回だけ知らせる(毎回出ると、画面の下の候補を隠す)
        try {
          if (localStorage.getItem(OFFLINE_NOTICE_KEY)) return
          localStorage.setItem(OFFLINE_NOTICE_KEY, '1')
        } catch {
          // 保存できなければ、出さない(繰り返し出るよりよい)
          return
        }
        latest.current()
      },
    })
  }, [])

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

  return {
    canInstall: installEvent !== null,
    install,
    /** iPhone/iPad で、まだホーム画面に追加していない */
    showIosHint: isIos() && !isStandalone(),
  }
}
