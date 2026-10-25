import { useSyncExternalStore } from 'react'
import { isOffline, subscribeNet } from '@/lib/net'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  // 電波が弱くて通信が止まったとき(遮断)と、それが解けたとき・期限が切れたときも知らせる
  const off = subscribeNet(onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
    off()
  }
}

/**
 * 通信できる見込みがあるか。端末がオフライン、または通信が止まっていると分かったあと(短い間)は false
 * (false の間、候補の検索などはしない。電波が戻る・しばらくたつと、true に戻って試す)
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !isOffline(),
    () => true
  )
}
