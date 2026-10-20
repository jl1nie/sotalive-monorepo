// 画面の選択と、API に送る options の対応(sotaapp2 の ConversionOptionsRequest・OutputFormat に合わせた契約)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { POTAActivatorTab } from './POTAActivatorTab'
import { SOTAActivatorTab } from './SOTAActivatorTab'
import { SOTAChaserTab } from './SOTAChaserTab'
import { bytesOf, chooseFile, chooseRadio, hamlogFile, mockDownload, mockServer, resetPrefs } from '@/test/tabs'

// バックエンドが受ける名前と値(api/src/handler/logconv/options.rs・service の MyQth・HisQth)
const MY_QTH = ['form', 'rmks1', 'rmks2']
const HIS_QTH = ['none', 'rmks1', 'rmks2', 'qth']
const KEYS = ['format', 'command', 'myQTH', 'QTH', 'Summit', 'Park', 'SOTAActivator', 'POTAActivator', 'POTAOperator', 'callsign']

beforeEach(resetPrefs)
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** バックエンドが知らない名前・値を送っていないこと */
function expectKnown(options: Record<string, unknown>) {
  for (const key of Object.keys(options)) expect(KEYS).toContain(key)
  if ('myQTH' in options) expect(MY_QTH).toContain(options.myQTH)
  if ('QTH' in options) expect(HIS_QTH).toContain(options.QTH)
  for (const key of ['Summit', 'Park', 'SOTAActivator', 'POTAActivator', 'POTAOperator', 'callsign']) {
    if (key in options) expect(typeof options[key]).toBe('string')
  }
}

const pairs = MY_QTH.flatMap((my) => HIS_QTH.map((his) => [my, his] as const))
// 同じ備考の列を指す組み合わせは、画面が送らない(既存のテスト)
const sendable = pairs.filter(([my, his]) => !(my !== 'form' && my === his))

describe('options の対応: POTA/ADIF', () => {
  it.each(sendable)('自局 %s × 相手 %s: myQTH・QTH と、入力した項目が対応する', async (my, his) => {
    const { sent } = mockServer({ '/api/v2/logconv/pota': { ok: true, json: { status: 'OK', log_text: [] } } })
    const { container } = render(<POTAActivatorTab />)
    fireEvent.change(screen.getByLabelText(/運用時のコールサイン/), { target: { value: 'ja1zzz/1' } })
    fireEvent.change(screen.getByLabelText(/運用時のオペレータ/), { target: { value: 'ja1yyy' } })
    chooseRadio(container, 'myQTH', my)
    chooseRadio(container, 'hisQTH', his)
    if (my === 'form') {
      fireEvent.change(screen.getByPlaceholderText('例: JAFF-0005 JP-0014'), { target: { value: 'jp-0014 jaff-0005' } })
    }
    chooseFile(container, hamlogFile())
    fireEvent.click(screen.getByRole('button', { name: /CSV読込/ }))
    await waitFor(() => expect(sent).toHaveLength(1))

    const o = sent[0].options
    expectKnown(o)
    expect(o).toMatchObject({
      format: 'pota',
      command: 'ADIFCSVCheck',
      myQTH: my,
      QTH: his,
      POTAActivator: 'JA1ZZZ/1',
      POTAOperator: 'JA1YYY',
    })
    // Park は、form のときだけ。入力は大文字にして、空白区切りのまま送る
    expect(o.Park).toBe(my === 'form' ? 'JP-0014 JAFF-0005' : '')
  })

  it('運用者を省くと、POTAOperator は空文字で送る(キーは残る)', async () => {
    const { sent } = mockServer({ '/api/v2/logconv/pota': { ok: true, json: { status: 'OK', log_text: [] } } })
    const { container } = render(<POTAActivatorTab />)
    fireEvent.change(screen.getByLabelText(/運用時のコールサイン/), { target: { value: 'JA1ZZZ' } })
    chooseRadio(container, 'myQTH', 'rmks1')
    chooseFile(container, hamlogFile())
    fireEvent.click(screen.getByRole('button', { name: /CSV読込/ }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].options.POTAOperator).toBe('')
  })
})

describe('options の対応: SOTA Activator', () => {
  it.each(sendable)('自局 %s × 相手 %s: myQTH・QTH・Summit・SOTAActivator が対応する', async (my, his) => {
    const { sent } = mockServer()
    mockDownload()
    const { container } = render(<SOTAActivatorTab />)
    fireEvent.change(screen.getByLabelText(/運用時のコールサイン/), { target: { value: 'ja1zzz/p' } })
    chooseRadio(container, 'myQTH', my)
    chooseRadio(container, 'hisQTH', his)
    if (my === 'form') {
      fireEvent.change(screen.getByPlaceholderText('例: JA/KN-006'), { target: { value: 'ja/kn-006' } })
    }
    chooseFile(container, hamlogFile())
    fireEvent.click(screen.getByRole('button', { name: /変換/ }))
    await waitFor(() => expect(sent).toHaveLength(1))

    expectKnown(sent[0].options)
    expect(sent[0].options).toEqual({
      format: 'sota_a',
      myQTH: my,
      QTH: his,
      Summit: my === 'form' ? 'JA/KN-006' : '',
      SOTAActivator: 'JA1ZZZ/P',
    })
  })

  // 入力欄は form のときだけ出るが、入れた値は保存される。form でないときに送ると、
  // バックエンドは「列の指定が優先」で無視するので害はないが、念のため現状を固定する
  it('form 以外に切り替えても、入力済みの Summit はそのまま送る(バックエンドが無視する)', async () => {
    const { sent } = mockServer()
    mockDownload()
    const { container } = render(<SOTAActivatorTab />)
    fireEvent.change(screen.getByLabelText(/運用時のコールサイン/), { target: { value: 'JA1ZZZ' } })
    fireEvent.change(screen.getByPlaceholderText('例: JA/KN-006'), { target: { value: 'JA/KN-006' } })
    chooseRadio(container, 'myQTH', 'rmks1')
    chooseFile(container, hamlogFile())
    fireEvent.click(screen.getByRole('button', { name: /変換/ }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].options).toMatchObject({ myQTH: 'rmks1', Summit: 'JA/KN-006' })
  })
})

describe('options の対応: SOTA Chaser', () => {
  it.each(['rmks1', 'rmks2', 'qth'])('相手 %s: format=sota_c・QTH・callsign だけを送る', async (his) => {
    const { sent } = mockServer()
    mockDownload()
    const { container } = render(<SOTAChaserTab />)
    fireEvent.change(container.querySelector('input[type="text"]') as HTMLInputElement, { target: { value: 'ja1zzz' } })
    chooseRadio(container, 'hisQTH', his)
    chooseFile(container, hamlogFile())
    fireEvent.click(screen.getByRole('button', { name: /変換/ }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expectKnown(sent[0].options)
    // チェイサーは自局の参照を持たない(myQTH・Summit・Park は送らない)
    expect(Object.keys(sent[0].options).sort()).toEqual(['QTH', 'callsign', 'format'])
  })

  it('相手局の選択肢に none はない(Chaser は相手の山が必須)', () => {
    const { container } = render(<SOTAChaserTab />)
    const values = [...container.querySelectorAll<HTMLInputElement>('input[name="hisQTH"]')].map((r) => r.value)
    expect(values).toEqual(['rmks1', 'rmks2', 'qth'])
  })
})

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])

describe('ファイルのバイト列', () => {
  // Shift_JIS の危険なバイト: 2バイト目が 0x5C(表・能・ソ)、半角カナ、0x1A(古い DOS の EOF)、
  // UTF-8 として不正な並び、NUL、0xFF
  const NASTY = new Uint8Array([
    0x95, 0x5c, 0x94, 0x5c, 0x83, 0x5c, 0xb1, 0xb2, 0xb3, 0x0d, 0x0a, 0x0a, 0x0d, 0x00, 0xff, 0xfe, 0x80, 0xfd, 0x1a,
  ])
  // BOM つき UTF-8 と、BOM つき UTF-16LE(画面はどちらも手を入れない)
  const BOM8 = new Uint8Array([0xef, 0xbb, 0xbf, 0x22, 0x41, 0x22])
  const BOM16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00])
  const big = new Uint8Array(1_000_000).map((_, i) => (i * 31 + 7) & 0xff)

  it.each([
    ['危険なバイト', NASTY],
    ['UTF-8 の BOM', BOM8],
    ['UTF-16LE の BOM', BOM16],
    ['空', new Uint8Array(0)],
    ['1MB の全バイト値', big],
  ])('SOTA Activator: %s を、そのまま・ファイル名もそのままで送る', async (_, bytes) => {
    const { sent } = mockServer()
    mockDownload()
    const { container } = render(<SOTAActivatorTab />)
    fireEvent.change(screen.getByLabelText(/運用時のコールサイン/), { target: { value: 'JA1ZZZ' } })
    chooseRadio(container, 'myQTH', 'rmks1')
    chooseFile(container, new File([bytes as Uint8Array<ArrayBuffer>], '交信ログ 2026.csv'))
    fireEvent.click(screen.getByRole('button', { name: /変換/ }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(same(await bytesOf(sent[0].file), bytes)).toBe(true)
    expect(sent[0].file.name).toBe('交信ログ 2026.csv')
  })

  it('POTA: 確認と生成の両方で、同じバイト列を送る', async () => {
    const { sent } = mockServer({ '/api/v2/logconv/pota': { ok: true, json: { status: 'OK', log_text: [] } } })
    mockDownload()
    const { container } = render(<POTAActivatorTab />)
    fireEvent.change(screen.getByLabelText(/運用時のコールサイン/), { target: { value: 'JA1ZZZ' } })
    chooseRadio(container, 'myQTH', 'rmks1')
    chooseFile(container, new File([NASTY], 'a.csv'))
    fireEvent.click(screen.getByRole('button', { name: /ADIF生成/ }))
    await waitFor(() => expect(sent).toHaveLength(2))
    for (const s of sent) expect(same(await bytesOf(s.file), NASTY)).toBe(true)
  })

  it('Chaser: 危険なバイトをそのまま送る', async () => {
    const { sent } = mockServer()
    mockDownload()
    const { container } = render(<SOTAChaserTab />)
    fireEvent.change(container.querySelector('input[type="text"]') as HTMLInputElement, { target: { value: 'JA1ZZZ' } })
    chooseFile(container, new File([NASTY], 'a.csv'))
    fireEvent.click(screen.getByRole('button', { name: /変換/ }))
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(same(await bytesOf(sent[0].file), NASTY)).toBe(true)
  })
})
