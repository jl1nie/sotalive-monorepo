// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Api } from './api.ts'
import { MESSAGES, createPotaLogDialog } from './potalog.ts'
import { createPrefs, type CookieIO } from './prefs.ts'

beforeAll(() => {
  // jsdom の <dialog> は、showModal・close がない版がある
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>
  proto.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  proto.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open') }
})

// 前のテストのダイアログが残ると、同じ ID が重複して、jsdom の #id 検索が最初の要素を返す
afterEach(() => { document.body.innerHTML = '' })

const jar = (initial: Record<string, string> = {}) => {
  const c = { ...initial }
  const io: CookieIO = { get: (k) => c[k], set: (k, v) => { c[k] = v } }
  return { io, c }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

/** サーバーの小さな模擬(旧版の挙動の記録 expected/potalog-*.json と同じ約束) */
function fakeApi(logs: Record<string, string>): { api: Api; calls: string[] } {
  const calls: string[] = []
  const api = {
    getLog: async (uuid: string) => (calls.push(`getLog ${uuid}`), logs[uuid] ? { logId: uuid, lastUpdate: logs[uuid] } : null),
    uploadLog: async (a: string | null, h: string | null, file: Blob | File) => {
      const name = (file as File).name ?? ''
      calls.push(`upload ${a}/${h} ${name}`)
      if (name.includes('bad')) return null
      const kind = name.includes('activator') ? 'activator' : 'hunter'
      const id = kind === 'activator' ? 'act-new' : 'hunt-new'
      logs[id] = '2026-10-01'
      return { logKind: kind, logId: id } as const
    },
    deleteLog: async (id: string) => (calls.push(`delete ${id}`), logs[id] ? (delete logs[id], {}) : null),
    exportShare: async (a: string | null, h: string | null) => (calls.push(`export ${a}/${h}`), { share_id: 'ABC123' }),
    importShare: async (key: string) => (calls.push(`import ${key}`), key === 'ABC123' ? { activator_logid: 'act-1', hunter_logid: 'hunt-1' } : null),
    logStat: async () => null,
    summitsNear: async () => [],
  } as unknown as Api
  return { api, calls }
}

function setup(cookies: Record<string, string> = {}, logs: Record<string, string> = { 'act-1': '2026-09-01', 'hunt-1': '2026-08-01' }) {
  const { io, c } = jar(cookies)
  const prefs = createPrefs(io)
  const { api, calls } = fakeApi(logs)
  const dlg = createPotaLogDialog({ prefs, api })
  document.body.append(dlg.element)
  const q = <T extends Element>(sel: string) => dlg.element.querySelector(sel) as T
  const click = async (text: string) => {
    const b = [...dlg.element.querySelectorAll('button')].find((x) => x.textContent === text)
    if (!b) throw new Error(`ボタンがない: ${text}`)
    b.click()
    await flush()
  }
  return { dlg, prefs, c, calls, q, click }
}

describe('POTA ログのダイアログ', () => {
  it('開くと、登録してある UUID を確認し、最終更新を出す', async () => {
    const t = setup({ pota_activator_uuid: 'act-1', pota_hunter_uuid: 'hunt-1', show_potalog: 'true' })
    t.dlg.open()
    await flush()
    const rows = [...t.dlg.element.querySelectorAll('.pl-updated')].map((e) => e.textContent)
    expect(rows).toEqual(['2026-09-01 更新', '2026-08-01 更新'])
    expect(t.q<HTMLInputElement>('#pl-show').checked).toBe(true)
    expect(t.q<HTMLInputElement>('#pl-activator').checked).toBe(true)
  })

  it('無効な UUID(サーバーにない)は、登録を消す。Cookie には、旧版が読める null を保存', async () => {
    const t = setup({ pota_hunter_uuid: 'gone' })
    t.dlg.open()
    await flush()
    expect(t.prefs.get().pota_hunter_uuid).toBeNull()
    expect(t.c.pota_hunter_uuid).toBe('null')
    expect(t.dlg.element.querySelectorAll('.pl-updated')[1].textContent).toBe('登録なし')
  })

  it('ファイルを選ばずにアップロードすると、メッセージを出し、サーバーを呼ばない', async () => {
    const t = setup()
    t.dlg.open()
    await flush()
    await t.click('アップロード')
    expect(t.q('.pl-status').textContent).toBe(MESSAGES.noFile)
    expect(t.calls.some((c) => c.startsWith('upload'))).toBe(false)
  })

  it('Activator のログをアップロードすると、その UUID を保存し、Activator の表示に切り替える', async () => {
    const t = setup({}, {})
    t.dlg.open()
    await flush()
    const input = t.q<HTMLInputElement>('#pl-file')
    Object.defineProperty(input, 'files', { value: [new File(['a'], 'activator.csv')], configurable: true })
    await t.click('アップロード')
    expect(t.calls).toContain('upload null/null activator.csv') // 登録なしの側は null(API では 'null')
    expect(t.prefs.get()).toMatchObject({ pota_activator_uuid: 'act-new', show_potalog: true, show_potaactlog: true })
    expect(t.q('.pl-status').textContent).toBe(MESSAGES.uploaded('activator'))
    expect(t.dlg.element.querySelectorAll('.pl-updated')[0].textContent).toBe('2026-10-01 更新')
  })

  it('不正なファイルは、メッセージを出し、登録を変えない', async () => {
    const t = setup({}, {})
    t.dlg.open()
    await flush()
    Object.defineProperty(t.q<HTMLInputElement>('#pl-file'), 'files', { value: [new File(['a'], 'bad.csv')], configurable: true })
    await t.click('アップロード')
    expect(t.q('.pl-status').textContent).toBe(MESSAGES.invalidFile)
    expect(t.q('.pl-status').getAttribute('role')).toBe('alert')
    expect(t.prefs.get().pota_activator_uuid).toBeNull()
  })

  it('Activator を削除すると、UUID を捨て、Hunter の表示に切り替える', async () => {
    const t = setup({ pota_activator_uuid: 'act-1', pota_hunter_uuid: 'hunt-1', show_potalog: 'true' })
    t.dlg.open()
    await flush()
    await t.click('削除') // 1 つ目 = Activator
    expect(t.calls).toContain('delete act-1')
    expect(t.prefs.get()).toMatchObject({ pota_activator_uuid: null, pota_hunter_uuid: 'hunt-1', show_potaactlog: false })
    expect(t.prefs.logId()).toBe('hunt-1')
  })

  it('共有キーを作る: 両方の UUID で、キーを表示', async () => {
    const t = setup({ pota_activator_uuid: 'act-1', pota_hunter_uuid: 'hunt-1' })
    t.dlg.open()
    await flush()
    await t.click('共有キーを作る')
    expect(t.calls).toContain('export act-1/hunt-1')
    expect(t.q('.pl-key').textContent).toBe('ABC123')
  })

  it('共有キーを取り込む: 両方の UUID を保存。旧版と同じく、Hunter の表示が、あとで勝つ', async () => {
    const t = setup({}, { 'act-1': '2026-09-01', 'hunt-1': '2026-08-01' })
    t.dlg.open()
    await flush()
    t.q<HTMLInputElement>('#pl-import').value = 'ABC123'
    await t.click('取り込む')
    expect(t.prefs.get()).toMatchObject({ pota_activator_uuid: 'act-1', pota_hunter_uuid: 'hunt-1', show_potalog: true, show_potaactlog: false })
  })

  it('見つからないキーは、メッセージ。登録を変えない', async () => {
    const t = setup()
    t.dlg.open()
    await flush()
    t.q<HTMLInputElement>('#pl-import').value = 'ZZZ999'
    await t.click('取り込む')
    expect(t.q('.pl-status').textContent).toBe(MESSAGES.keyNotFound)
    expect(t.prefs.get().pota_hunter_uuid).toBeNull()
  })

  it('「地図に反映する」と Activator・Hunter の切り替えは、設定(Cookie)に保存する', async () => {
    const t = setup({ pota_activator_uuid: 'act-1', pota_hunter_uuid: 'hunt-1' })
    t.dlg.open()
    await flush()
    const show = t.q<HTMLInputElement>('#pl-show')
    show.checked = true
    show.dispatchEvent(new Event('change'))
    expect(t.c.show_potalog).toBe('true')
    const hunt = t.q<HTMLInputElement>('#pl-hunter')
    hunt.checked = true
    hunt.dispatchEvent(new Event('change'))
    expect(t.c.show_potaactlog).toBe('false')
    expect(t.prefs.logId()).toBe('hunt-1')
  })

  it('外から来る値(最終更新など)は、HTML として解釈しない', async () => {
    const t = setup({ pota_activator_uuid: 'act-1' }, { 'act-1': '<img src=x onerror=alert(1)>' })
    t.dlg.open()
    await flush()
    expect(t.dlg.element.querySelector('img')).toBeNull()
    expect(t.dlg.element.querySelector('.pl-updated')!.textContent).toContain('<img')
  })
})
