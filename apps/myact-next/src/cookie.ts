/**
 * Cookie の読み書き。旧版 MyACT(js-cookie)と同じ形: 値は URL エンコード、path=/、有効期限 1800 日、SameSite=Lax。
 * 旧版と同じ名前・値で読み書きするので、切り替えても、利用者の設定・POTA ログの UUID が、そのまま引き継がれる。
 */
const DAYS = 1800

export function getCookie(name: string): string | undefined {
  for (const part of document.cookie.split('; ')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1))
  }
  return undefined
}

export function setCookie(name: string, value: string | number): void {
  const expires = new Date(Date.now() + DAYS * 86400_000).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(String(value))}; expires=${expires}; path=/; SameSite=Lax`
}

/** 前回の現在地(旧版と同じ名前) */
export const COOKIE_LAT = 'my_qth_lat'
export const COOKIE_LNG = 'my_qth_lng'
