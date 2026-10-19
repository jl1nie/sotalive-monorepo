const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 書き出すファイルの名前。中身(最初の QSO の日付@運用場所)に、書き出した時刻(端末の時計)を付けて、
 * 上書きにならないようにする。QSO がまだなければ、日付と時刻だけ。
 * `fle-20261019@JA-ST-012-JP-1151-1543.zip`
 */
export function exportName(stem: string | null, now: Date, ext: string): string {
  const hhmm = `${pad(now.getHours())}${pad(now.getMinutes())}`
  const body = stem ?? `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  return `fle-${body}-${hhmm}.${ext}`
}
