// 変換の画面(タブ)のテストの道具: サーバー(fetch)・ファイルの選択・ダウンロードを差し替える
import { fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { usePrefsStore } from '@/stores/prefsStore'

// 日本語版 HAMLOG の CSV(Shift_JIS・CRLF)。「表」(0x95 0x5C)は、2バイト目が `\` と同じ
const SJIS_ROW = [
  ...new TextEncoder().encode('"JA1AAA","25/10/18","09:00J","599","599","7","CW","","","","","'),
  0x95, 0x5c, // 表
  ...new TextEncoder().encode(' JA-0123","","%%","0"\r\n'),
]

/** HAMLOG の CSV のファイル。中身は Shift_JIS のバイト列(画面は、読み替えずにそのまま送る) */
export function hamlogFile(name = 'hamlog.csv'): File {
  return new File([new Uint8Array(SJIS_ROW)], name, { type: 'text/csv' })
}

export const hamlogBytes = () => new Uint8Array(SJIS_ROW)

/** 送ったリクエスト */
export interface Sent {
  url: string
  options: Record<string, unknown>
  file: File
}

type Reply = { ok: boolean; json?: unknown }

/** fetch を差し替える。URL ごとの応答(なければ ZIP)。送ったリクエストを `sent` に集める */
export function mockServer(replies: Record<string, Reply | Reply[]> = {}) {
  const sent: Sent[] = []
  const queues = Object.fromEntries(
    Object.entries(replies).map(([url, r]) => [url, Array.isArray(r) ? [...r] : [r]])
  )
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const body = init.body as FormData
    sent.push({
      url,
      options: JSON.parse(body.get('options') as string),
      file: body.get('file') as File,
    })
    const queue = queues[url]
    const reply = queue && queue.length > 1 ? queue.shift()! : queue?.[0] ?? { ok: true }
    return {
      ok: reply.ok,
      json: async () => reply.json,
      blob: async () => new Blob(['PK'], { type: 'application/zip' }),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { sent, fetchMock }
}

/** ダウンロード(リンクのクリック)を差し替える。保存したファイル名を `names` に集める */
export function mockDownload() {
  const names: string[] = []
  URL.createObjectURL = vi.fn(() => 'blob:zip')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download)
  })
  return { names }
}

/** ファイルを選ぶ(隠してある <input type="file">) */
export function chooseFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

/** ラジオボタン(name と value で選ぶ。同じ文言が「運用先」と「相手局」の両方にあるため) */
export function chooseRadio(container: HTMLElement, name: string, value: string) {
  fireEvent.click(container.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement)
}

/** ファイルのバイト列(jsdom の File には arrayBuffer がないので、FileReader で読む) */
export function bytesOf(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

/** 画面の設定(保存される)を、既定に戻す */
export function resetPrefs() {
  localStorage.clear()
  usePrefsStore.setState({
    potaActivationCall: '',
    potaOperator: '',
    potaPark: '',
    myQTHPota: 'form',
    actQTHPota: 'none',
    sotaActivationCall: '',
    sotaSummit: '',
    myQTHSota: 'form',
    actQTHSota: 'none',
    chaserCall: '',
    hisQTHChaser: 'rmks1',
  })
}
