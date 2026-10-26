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

/**
 * ログに QSO があるのに、最初の QSO より前に `timezone` の行がなく、設定の時間帯が UTC でないとき。
 * このログの時刻は UTC として読まれているので、どちらの時間帯で書いたかを確かめる(貼り付けたログや、
 * 時間帯を書く前の版で書いたログ)。
 */
export function zoneUnset(text: string, view: LogView, tz: number): boolean {
  if (tz === 0 || view.qsos.length === 0) return false
  const first = Math.min(...view.qsos.map((q) => q.line))
  return !text
    .split('\n')
    .slice(0, first)
    .some((l) => /^\s*timezone\b/i.test(l))
}
