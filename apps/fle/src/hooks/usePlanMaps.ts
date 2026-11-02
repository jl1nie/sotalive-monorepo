import { useCallback, useEffect, useState } from 'react'
import { ensureRegions, type MapStatus } from '@/lib/mapStore'
import { regionOf } from '@/lib/summitMap'
import type { Plan } from '@/lib/plans'

/**
 * 予定に入れた山頂の地図を、端末にそろえる。確かめるのは、アプリを開いたときと、予定が変わったとき
 * (保存・同期で届いたとき)だけ。電波が戻ったときや、取れなかったときに自動で取り直すことはしない
 * (電波が途切れ途切れの山頂で通信しない)。取れなかった地図は、次に開いたときか、地図を開いたときに取る。
 * これで、電波のあるところで開いておけば、電波のないところでも地図が見える。
 * `statusOf` は、山頂の地図の状態(山頂でなければ null)
 */
export function usePlanMaps(plans: Plan[]) {
  const [status, setStatus] = useState<Map<string, MapStatus>>(new Map())
  // 予定の山頂の地域だけが変わったときに確かめる(予定の名前などを変えても、取り直さない)
  const key = [...new Set(plans.map((p) => regionOf(p.sota)).filter(Boolean))].sort().join(',')

  useEffect(() => {
    let alive = true
    void ensureRegions(key ? key.split(',') : [], navigator.onLine).then((s) => {
      if (alive) setStatus(s)
    })
    return () => {
      alive = false
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
