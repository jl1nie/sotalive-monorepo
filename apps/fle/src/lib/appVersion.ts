const VERSION_KEY = 'fle.version'

type Store = Pick<Storage, 'getItem' | 'setItem'>

/**
 * 新しい版で開いた最初の 1 回だけ true を返す(前に開いた版を端末に覚えておき、比べる。通信はしない)。
 * 初めて開いたとき・同じ版・開発中の版(`dev`)・保存できない端末では false。
 */
export function takeVersionChange(current: string, store: Store = localStorage): boolean {
  if (current === 'dev') return false
  try {
    const last = store.getItem(VERSION_KEY)
    if (last === current) return false
    store.setItem(VERSION_KEY, current)
    return last !== null
  } catch {
    return false
  }
}
