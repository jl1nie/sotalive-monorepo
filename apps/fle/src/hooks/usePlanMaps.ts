import { useCallback, useEffect, useState } from 'react'
import { ensureRegions, type MapStatus } from '@/lib/mapStore'
import { regionOf } from '@/lib/summitMap'
import type { Plan } from '@/lib/plans'

/** まだ取れていない地域を、取り直すまでの間隔 */
const RETRY_MS = 60_000

/**
 * 予定に入れた山頂の地図を、端末にそろえる。予定が変わったとき(保存・同期で届いたとき)、開いたとき、電波が戻ったときに確かめ、
 * まだない地域を取る。これで、予定に入れておけば、電波のないところでも地図が見える。
 * `statusOf` は、山頂の地図の状態(山頂でなければ null)
 */
export function usePlanMaps(plans: Plan[]) {
  const [status, setStatus] = useState<Map<string, MapStatus>>(new Map())
  // 予定の山頂の地域だけが変わったときに確かめる(予定の名前などを変えても、取り直さない)
  const key = [...new Set(plans.map((p) => regionOf(p.sota)).filter(Boolean))].sort().join(',')

  useEffect(() => {
    let alive = true
    let retry = 0
    const check = () => {
      window.clearTimeout(retry)
      void ensureRegions(key ? key.split(',') : [], navigator.onLine).then((s) => {
        if (!alive) return
        setStatus(s)
        // 電波が弱くて取れなかった地域は、少し待って取り直す
        if ([...s.values()].includes('pending')) retry = window.setTimeout(check, RETRY_MS)
      })
    }
    check()
    window.addEventListener('online', check)
    return () => {
      alive = false
      window.clearTimeout(retry)
      window.removeEventListener('online', check)
    }
  }, [key])

  const statusOf = useCallback(
    (summit: string): MapStatus | null => {
      const region = regionOf(summit)
      return region ? (status.get(region) ?? 'pending') : null
    },
    [status]
  )
  return { statusOf }
}
