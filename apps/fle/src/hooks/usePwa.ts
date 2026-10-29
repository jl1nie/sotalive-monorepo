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

/** 開いたままのタブが、新しい版を取りに行く間隔 */
const UPDATE_CHECK_MS = 60 * 60 * 1000

/**
 * Service Worker(オフライン)とインストールの状態。
 * 画面はネットワーク優先で取るので、開き直せば最新になる。タブを開いたままの人のために、
 * 新しい版を定期的に調べ、見つけたら知らせて、タブに戻ってきたときに再読み込みする(ログは自動保存されている)。
 */
export function usePwa(onOfflineReady: () => void, onUpdated: () => void = () => {}) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  // 登録は1回だけ。通知は、そのときの言語で出す(最新の関数を参照する)
  const latest = useRef(onOfflineReady)
  const latestUpdated = useRef(onUpdated)
  useEffect(() => {
    latest.current = onOfflineReady
    latestUpdated.current = onUpdated
  })
  useEffect(() => {
    // 開発サーバーでは Service Worker を使わない
    if (!import.meta.env.PROD) return
    // 新しい Service Worker が引き継いだら(最初の1回の登録は除く)、古い画面は作り直す必要がある
    const sw = navigator.serviceWorker
    const hadController = sw?.controller != null
    let updated = false
    const onControllerChange = () => {
      if (!hadController || updated) return
      updated = true
      latestUpdated.current()
    }
    const onVisible = () => {
      // 画面を離れるときにログは保存済み。戻ってきたところで、新しい版にする
      if (document.visibilityState === 'visible' && updated) window.location.reload()
    }
    sw?.addEventListener('controllerchange', onControllerChange)
    document.addEventListener('visibilitychange', onVisible)
    let stopChecking = () => {}
    registerSW({
      onRegisteredSW(_url, registration) {
        if (!registration) return
        const check = () => void registration.update().catch(() => {})
        const onShown = () => document.visibilityState === 'visible' && check()
        const timer = window.setInterval(check, UPDATE_CHECK_MS)
        document.addEventListener('visibilitychange', onShown)
        stopChecking = () => {
          window.clearInterval(timer)
          document.removeEventListener('visibilitychange', onShown)
        }
      },
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
    return () => {
      sw?.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisible)
      stopChecking()
    }
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
