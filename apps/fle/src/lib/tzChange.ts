import type { LogView } from './fle'

/**
 * 設定の時間帯を `tz` に変えるとき、ログをどうするか。
 * - `none`: ログは変えない(QSO の時刻が、もうその時間帯で書かれている。空のログ)
 * - `rewrite`: QSO がないので、確かめずに timezone の行を書き直す
 * - `ask`: 時刻を変換するかを確かめる。例として、最初の QSO の時刻と、変換した時刻を出す
 */
export type TzChange =
  | { kind: 'none' }
  | { kind: 'rewrite' }
  | { kind: 'ask'; from: string; to: string; qsos: number }

export function planTzChange(text: string, view: LogView, tz: number): TzChange {
  const qsos = view.qsos
  if (qsos.length === 0) return text.trim() ? { kind: 'rewrite' } : { kind: 'none' }
  if (qsos.every((q) => q.tz === tz)) return { kind: 'none' }
  const first = qsos[0]
  return { kind: 'ask', from: first.localTime, to: shift(first.time, tz), qsos: qsos.length }
}

/** UTC の `HH:MM` を、`tz` の時刻にする */
function shift(utc: string, tz: number): string {
  const [h, m] = utc.split(':').map(Number)
  const hour = (((h + tz) % 24) + 24) % 24
  return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
