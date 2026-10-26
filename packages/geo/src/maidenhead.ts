/** 緯度経度から、グリッドロケーター(8 桁。例: PM95uq96)を求める。 */
export function maidenhead(lat: number, lng: number): string {
  let x = lng + 180
  let y = lat + 90
  let s = String.fromCharCode(65 + Math.floor(x / 20), 65 + Math.floor(y / 10))
  x %= 20
  y %= 10
  s += Math.floor(x / 2) + '' + Math.floor(y)
  x = (x % 2) / 2
  y = y % 1
  s += String.fromCharCode(97 + Math.floor(x * 24), 97 + Math.floor(y * 24))
  x = (x * 24) % 1
  y = (y * 24) % 1
  s += Math.floor(x * 10) + '' + Math.floor(y * 10)
  return s
}
