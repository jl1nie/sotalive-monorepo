/**
 * ActPaddle(パドルエミュレータ)。ポップアップのボタンから開くダイアログで、メッセージを選んで SEND する。
 * 送り先は、WiFi(https://<host>/play に POST)か、USB(Web Serial, 115200bps)。どちらも、メッセージをクリップボードにコピーする。
 * 旧版(`pemuPressed`)と同じ送信内容(JSON + CR)。旧版との差分(docs・intentional-diffs.md): `$CALL` などを、すべて置き換える・
 * Content-Type の誤字を直す・接続エラーを alert ではなく、ダイアログの中に出す。
 */
import { h } from './dom.ts'
import type { Prefs, PrefsStore } from './prefs.ts'

/** ポップアップから引き継ぐ場所の値(旧版の area) */
export interface PaddlePlace {
  name: string
  sota: string
  pota: string
  jaff: string
  areacode: string
  /** 'JCC 1112' / 'JCG 1002A' */
  century: string
}

export interface PaddleMessage {
  wpm: number
  to_paddle?: string
  to_straight?: string
  reverse: boolean
}

/** メッセージのひな形を、場所の値で置き換える(大文字にして、すべて置き換え。SOTA・POTA・JAFF は '-' を除く) */
export function expandMessage(template: string, call: string, place: PaddlePlace, includeAreacode: boolean): string {
  const full = includeAreacode && place.areacode !== '' ? `${call}/${place.areacode}` : call
  const noDash = (v: string) => v.replace('-', '')
  return template
    .toUpperCase()
    .replaceAll('$CALL', full)
    .replaceAll('$SOTA', noDash(place.sota))
    .replaceAll('$POTA', noDash(place.pota))
    .replaceAll('$JAFF', noDash(place.jaff))
    .replaceAll('$JCC', place.century)
    .replaceAll('$JCG', place.century)
}

/** 機器に送る文字列(JSON + CR) */
export function payload(message: string, p: Pick<Prefs, 'pemu_wpm' | 'to_paddle' | 'paddle_reverse'>): string {
  const body: PaddleMessage = { wpm: parseInt(p.pemu_wpm, 10), reverse: p.paddle_reverse }
  // JSON のキーの並びは、旧版と同じ(wpm・to_paddle か to_straight・reverse)
  const ordered = p.to_paddle ? { wpm: body.wpm, to_paddle: message, reverse: body.reverse } : { wpm: body.wpm, to_straight: message, reverse: body.reverse }
  return JSON.stringify(ordered) + '\r'
}

export const SERIAL_FILTERS = [
  { usbVendorId: 0x303a, usbProductId: 0x1001 },
  { usbVendorId: 0x0403, usbProductId: 0x6001 },
  { usbVendorId: 0x1a86, usbProductId: 0x55d4 },
  { usbVendorId: 0x10c4, usbProductId: 0xea60 },
]

/** Web Serial の最小の型(lib.dom にない) */
interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>
  writable: WritableStream<Uint8Array>
  readable: ReadableStream<Uint8Array>
}
interface SerialLike {
  requestPort(o: { filters: typeof SERIAL_FILTERS }): Promise<SerialPortLike>
}

export interface PaddleOptions {
  prefs: PrefsStore
  fetch?: typeof fetch
  serial?: () => SerialLike | undefined
}

const FIELD = 'form-control form-control-sm'

export function createPaddleDialog({ prefs, fetch: doFetch = (...a) => fetch(...a), serial = () => (navigator as unknown as { serial?: SerialLike }).serial }: PaddleOptions) {
  let place: PaddlePlace = { name: '', sota: '', pota: '', jaff: '', areacode: '', century: '' }
  let writer: WritableStreamDefaultWriter<string> | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined

  const text = (id: string, size: number, label: string) => h('input', { type: 'text', id, size, class: FIELD, 'aria-label': label, autocomplete: 'off' })
  const f = {
    name: h('div', { id: 'pemu_name', class: 'pemu-name' }),
    call: text('pemu_call', 10, 'CALL'),
    areacode: text('pemu_areacode', 1, 'エリア番号'),
    century: text('pemu_century', 10, 'JCC/JCG'),
    sota: text('pemu_sota', 10, 'SOTA'),
    pota: text('pemu_pota', 8, 'POTA'),
    jaff: text('pemu_jaff', 10, 'JAFF'),
    mesg: [1, 2, 3, 4].map((n) => text(`pemu_mesg${n}`, 44, `メッセージ ${n}`)),
    wpm: text('pemu_wpm', 3, 'WPM'),
    host: text('pemu_host', 16, 'ホスト名'),
  }
  const check = (id: string, label: string) => {
    const input = h('input', { type: 'checkbox', id })
    return { input, el: h('label', { class: 'pemu-check' }, input, ` ${label}`) }
  }
  const includeArea = check('include_areacode', 'エリアを CALL に付ける')
  const reverse = check('paddle_reverse', 'パドルを反転')
  const radio = (name: string, id: string, label: string) => {
    const input = h('input', { type: 'radio', name, id })
    return { input, el: h('label', { class: 'pemu-check' }, input, ` ${label}`) }
  }
  const wifi = radio('pemu-via', 'enable_wifi', 'WiFi')
  const usb = radio('pemu-via', 'enable_serial', 'USB(Web Serial。Chrome の PC・Android)')
  const paddle = radio('pemu-key', 'to_paddle', 'パドル')
  const straight = radio('pemu-key', 'to_key', 'ストレートキー')
  const status = h('div', { class: 'pemu-status', role: 'status', hidden: true })

  const showStatus = (message: string, kind: 'ok' | 'error') => {
    status.hidden = false
    status.className = `pemu-status pemu-${kind}`
    status.setAttribute('role', kind === 'error' ? 'alert' : 'status')
    status.textContent = message
  }

  /** 入力を、設定に保存する(場所の値は、保存しない。開くたびに、ポップアップから引き継ぐ) */
  function save() {
    prefs.set({
      pemu_call: f.call.value, pemu_wpm: f.wpm.value, pemu_host: f.host.value,
      pemu_mesg1: f.mesg[0].value, pemu_mesg2: f.mesg[1].value, pemu_mesg3: f.mesg[2].value, pemu_mesg4: f.mesg[3].value,
      include_areacode: includeArea.input.checked, paddle_reverse: reverse.input.checked,
      to_paddle: paddle.input.checked, enable_wifi: wifi.input.checked,
    })
  }

  async function openSerial(): Promise<void> {
    const s = serial()
    if (!s) throw new Error('お使いのブラウザは、シリアル通信ができません')
    if (writer) return
    const port = await s.requestPort({ filters: SERIAL_FILTERS })
    await port.open({ baudRate: 115200 })
    const encoder = new TextEncoderStream()
    void encoder.readable.pipeTo(port.writable)
    writer = encoder.writable.getWriter()
    reader = port.readable.getReader()
  }

  async function send(n: number) {
    save()
    const p = prefs.get()
    place = { ...place, areacode: f.areacode.value, century: f.century.value, sota: f.sota.value, pota: f.pota.value, jaff: f.jaff.value }
    const message = expandMessage(p[`pemu_mesg${n}` as 'pemu_mesg1'], p.pemu_call, place, p.include_areacode)
    const body = payload(message, p)
    void navigator.clipboard?.writeText(message)
    try {
      if (p.enable_wifi) {
        const url = `https://${p.pemu_host}/play`
        try {
          const res = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
          if (!res.ok) throw new Error(res.statusText)
        } catch (e) {
          throw new Error(`接続エラー: ${url} (${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}) — 機器の電源と WiFi を確かめて、もう一度送ってください`)
        }
      } else {
        await openSerial()
        try {
          await writer!.write(body)
        } catch {
          writer = undefined
          throw new Error('接続エラー: ブラウザをリロードしてください')
        }
        await reader?.read()
      }
      showStatus(`送信した: ${message}(クリップボードにもコピーしました)`, 'ok')
    } catch (e) {
      showStatus(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  const row = (...cells: (Node | string)[]) => h('div', { class: 'pemu-row' }, ...cells)
  const dialog = h('dialog', { class: 'pl-dialog pemu-dialog', id: 'pemuact', 'aria-labelledby': 'pemu-title' },
    h('div', { class: 'pl-head' },
      h('b', { id: 'pemu-title' }, 'ActPaddle'),
      h('button', { type: 'button', class: 'pl-close', 'aria-label': '閉じる', 'on:click': () => dialog.close() }, '×'),
    ),
    h('div', { class: 'pl-body' },
      f.name,
      row('CALL:', f.call, '/', f.areacode, includeArea.el, 'JCC/JCG:', f.century),
      row('SOTA:', f.sota, 'POTA:', f.pota, 'JAFF:', f.jaff),
      ...f.mesg.map((input, i) => row(`${i + 1}.`, input, h('button', { type: 'button', class: 'btn btn-primary', 'on:click': () => void send(i + 1) }, 'SEND'))),
      row('Speed:', f.wpm, 'wpm', reverse.el),
      row(h('fieldset', {}, h('legend', {}, '送り方'), wifi.el, row('https://', f.host, '/play'), usb.el), h('fieldset', {}, h('legend', {}, 'キー'), paddle.el, straight.el)),
      status,
    ),
  )
  // 閉じたときも、設定を保存する(旧版の hide.bs.modal)
  dialog.addEventListener('close', save)

  /** 場所の値を入れて開く(設定の値は、保存してあるものを入れる) */
  function open(next: PaddlePlace) {
    place = next
    const p = prefs.get()
    f.name.textContent = next.name
    f.call.value = p.pemu_call
    f.areacode.value = next.areacode
    f.century.value = next.century
    f.sota.value = next.sota
    f.pota.value = next.pota
    f.jaff.value = next.jaff
    ;[p.pemu_mesg1, p.pemu_mesg2, p.pemu_mesg3, p.pemu_mesg4].forEach((v, i) => { f.mesg[i].value = v })
    f.wpm.value = p.pemu_wpm
    f.host.value = p.pemu_host
    includeArea.input.checked = p.include_areacode
    reverse.input.checked = p.paddle_reverse
    wifi.input.checked = p.enable_wifi
    usb.input.checked = !p.enable_wifi
    paddle.input.checked = p.to_paddle
    straight.input.checked = !p.to_paddle
    status.hidden = true
    if (!dialog.open) dialog.showModal()
  }
  return { element: dialog, open }
}
export type PaddleDialog = ReturnType<typeof createPaddleDialog>
