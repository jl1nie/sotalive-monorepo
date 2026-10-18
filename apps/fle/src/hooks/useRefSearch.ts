import { useEffect, useState } from 'react'
import { searchByName, type RefKind, type SearchResult } from '@/lib/reference'

const MIN_LENGTH = 2
const DEBOUNCE_MS = 300

/**
 * 入力中の語で、山・公園を探す。少し待ってから問い合わせ、次の入力では前の検索を中止する。
 * `result` は、いまの入力に対する結果(検索中は null)。検索しない状態は `active = false`。
 */
export function useRefSearch(kind: RefKind, query: string, enabled: boolean) {
  const q = query.trim()
  const active = enabled && q.length >= MIN_LENGTH
  const key = `${kind}|${q}`
  // どの入力に対する結果かを持ち、古い結果は使わない(effect の中で同期的に state を直さない)
  const [done, setDone] = useState<{ key: string; value: SearchResult } | null>(null)

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      searchByName(kind, q, { signal: controller.signal })
        .then((value) => setDone({ key, value }))
        .catch(() => {}) // 中止された検索は、何もしない
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [active, kind, q, key])

  const result = active && done?.key === key ? done.value : null
  return { active, loading: active && result === null, result }
}
