/** 時計(旧版 `clock`): 「26/10/27 20:38 A:5 K:1」。地磁気の指数は、取れたときだけ。 */
export interface Geomag {
  aIndex: number
  kIndex: number[]
}
const pad = (n: number) => String(n).padStart(2, '0')

export function geomagText(g: Geomag | null): string {
  return g ? `A:${g.aIndex} K:${g.kIndex[0]}` : ''
}

export function formatClock(now: Date, g: Geomag | null): string {
  const t = `${pad(now.getFullYear() % 100)}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  return g ? `${t} ${geomagText(g)}` : t
}
