/** 現在地の取得の状況を、地図の上の帯に出す(位置情報の許可が保留・拒否のとき、画面から分からなかったため) */

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown'

/** 許可の確認(prompt)が保留のままだと、コールバックが呼ばれず、何も起きない。この時間で、案内を出す */
export const PENDING_HINT_MS = 15000

export const MESSAGES = {
  waiting: '現在地を取得中…',
  waitingPrompt: '現在地を取得中… 位置情報の許可を求められたら「許可」を選んでください',
  denied: '位置情報が許可されていません。端末の設定で、このブラウザーとこのサイトの位置情報を許可して、「QTH」を押してください',
  pending: '位置情報の許可の確認が保留のままです。「QTH」を押し直して、「許可」を選んでください',
  unavailable: '端末の位置がわかりませんでした。電波の良い所で、もう一度「QTH」を押してください',
  timeout: 'タイムアウトしました。もう一度「QTH」を押してください',
  other: 'エラーが発生しました。もう一度「QTH」を押してください',
} as const

/** 位置情報の許可の状態から、取得中に出す文言 */
export function waitingMessage(state: PermissionState): string {
  if (state === 'denied') return MESSAGES.denied
  if (state === 'prompt') return MESSAGES.waitingPrompt
  return MESSAGES.waiting
}

/** GeolocationPositionError.code(1 許可なし・2 位置不明・3 タイムアウト)から、失敗の案内 */
export function errorMessage(code: number): string {
  if (code === 1) return MESSAGES.denied
  if (code === 2) return MESSAGES.unavailable
  if (code === 3) return MESSAGES.timeout
  return MESSAGES.other
}

/** 許可の状態を調べる(Permissions API。ないブラウザーは 'unknown')。取得の開始は待たせない */
export async function queryPermission(): Promise<PermissionState> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    return 'unknown'
  }
}

/** 地図の上に出す帯。タップで消す */
export class StatusBanner {
  private el: HTMLElement

  constructor(container: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'locate-status'
    this.el.setAttribute('role', 'status')
    this.el.hidden = true
    this.el.addEventListener('click', () => this.hide())
    container.appendChild(this.el)
  }

  show(message: string): void {
    this.el.textContent = message
    this.el.hidden = false
  }

  hide(): void {
    this.el.hidden = true
  }
}
