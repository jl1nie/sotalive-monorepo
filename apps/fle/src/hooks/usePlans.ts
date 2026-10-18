import { useCallback, useRef, useState } from 'react'
import { MAX_PLANS, livePlans, type Plan, type PlanRecord } from '@/lib/plans'

const KEY = 'fle.plans'

function load(): PlanRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? (v as PlanRecord[]).filter((r) => r && typeof r.id === 'string' && typeof r.updatedAt === 'number') : []
  } catch {
    return []
  }
}

/** 運用の予定(端末に保存。消した印も持つ。同期は useSync) */
export function usePlans() {
  const [records, setRecords] = useState<PlanRecord[]>(load)
  const current = useRef(records)

  const commit = useCallback((next: PlanRecord[]) => {
    current.current = next
    setRecords(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // 保存できなくても、画面の中では使える
    }
  }, [])

  /** 予定を保存する(更新時刻は、ここで付ける)。いっぱいで足せなければ false */
  const save = useCallback(
    (plan: Omit<Plan, 'updatedAt'>): boolean => {
      const exists = current.current.some((r) => r.id === plan.id && !('deleted' in r))
      if (!exists && livePlans(current.current).length >= MAX_PLANS) return false
      commit([...current.current.filter((r) => r.id !== plan.id), { ...plan, updatedAt: Date.now() }])
      return true
    },
    [commit]
  )

  /** 予定を消す(ほかの端末にも伝わるよう、印を残す) */
  const remove = useCallback(
    (id: string) => commit([...current.current.filter((r) => r.id !== id), { id, updatedAt: Date.now(), deleted: true }]),
    [commit]
  )

  return { records, plans: livePlans(records), save, remove, replaceAll: commit }
}
