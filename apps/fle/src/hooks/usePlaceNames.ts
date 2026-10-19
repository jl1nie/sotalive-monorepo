import { useEffect, useState } from 'react'
import { placeName, type PlaceKind } from '@/lib/reference'

/**
 * 山・公園の番号から、名前を引く(オンラインのときだけ)。番号 → 名前。まだ引けていない番号は入らない。
 * 引いた名前は覚えておくので、カーソルを行き来しても問い合わせ直さない。
 */
export function usePlaceNames(kind: PlaceKind, codes: string[]): Record<string, string> {
  const key = `${kind}|${codes.join(' ')}`
  const [done, setDone] = useState<{ key: string; names: Record<string, string> } | null>(null)

  useEffect(() => {
    if (codes.length === 0) return
    const controller = new AbortController()
    Promise.all(codes.map((c) => placeName(kind, c, { signal: controller.signal }).catch(() => undefined)))
      .then((names) => {
        const found: Record<string, string> = {}
        codes.forEach((c, i) => {
          if (names[i]) found[c] = names[i]
        })
        setDone({ key, names: found })
      })
      .catch(() => {})
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- codes は key に含まれる
  }, [key])

  return done?.key === key ? done.names : {}
}
