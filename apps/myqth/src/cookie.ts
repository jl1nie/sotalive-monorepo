/** 前回の現在地を覚える Cookie(旧版と同じ名前。切り替えたあとも、前の位置を引き継ぐ) */
export const COOKIE_LAT = 'my_qth_lat'
export const COOKIE_LNG = 'my_qth_lng'

export function getCookie(name: string): string | undefined {
  for (const part of document.cookie.split('; ')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1))
  }
  return undefined
}

/** 旧版(js-cookie の既定)と同じ、ブラウザーを閉じるまでの Cookie */
export function setCookie(name: string, value: string | number): void {
  document.cookie = `${name}=${encodeURIComponent(String(value))}; path=/; SameSite=Lax`
}
