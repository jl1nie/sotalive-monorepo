import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { POTAActivatorTab } from './POTAActivatorTab'
import {
  bytesOf,
  chooseFile,
  chooseRadio,
  hamlogBytes,
  hamlogFile,
  mockDownload,
  mockServer,
  resetPrefs,
} from '@/test/tabs'

const CHECK = '/api/v2/logconv/pota'
const CONVERT = '/api/v2/logconv/hamlog'
const OK = { ok: true, json: { status: 'OK', log_text: [] } }

beforeEach(resetPrefs)
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** コールサインと運用先を入れて、ファイルを選んだ画面 */
function setup(park = 'JA-0001 JA-0002 JAFF-0001') {
  const view = render(<POTAActivatorTab />)
  fireEvent.change(screen.getByLabelText(/運用時のコールサイン/), { target: { value: 'ja1zzz/1' } })
  fireEvent.change(screen.getByLabelText(/運用時のオペレータ/), { target: { value: 'ja1zzz' } })
  fireEvent.change(screen.getByPlaceholderText('例: JAFF-0005 JP-0014'), { target: { value: park } })
  chooseFile(view.container, hamlogFile())
  return view
}

const readCsv = () => fireEvent.click(screen.getByRole('button', { name: /CSV読込/ }))
const generate = () => fireEvent.click(screen.getByRole('button', { name: /ADIF生成/ }))

describe('POTA/WWFF/SOTA ADIF', () => {
  it('CSV読込: 確認(ADIFCSVCheck)に、指定とファイルをそのまま送り、表を出す', async () => {
    const { sent } = mockServer({
      [CHECK]: {
        ok: true,
        json: {
          status: 'OK',
          log_text: [['JA1AAA', '20251018', '0000', '40m', 'CW', '599', '599', 'JA-0123', 'JA-0001/JA-0002', 'JA1ZZZ/1', 'JA1ZZZ']],
        },
      },
    })
    const { container } = setup()
    chooseRadio(container, 'hisQTH', 'qth')
    readCsv()

    expect(await screen.findByText('JA-0001/JA-0002')).toBeInTheDocument()
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe(CHECK)
    expect(sent[0].options).toEqual({
      format: 'pota',
      command: 'ADIFCSVCheck',
      myQTH: 'form',
      QTH: 'qth',
      Park: 'JA-0001 JA-0002 JAFF-0001',
      POTAActivator: 'JA1ZZZ/1',
      POTAOperator: 'JA1ZZZ',
    })
    // Shift_JIS のバイト列のまま(文字列に読み替えると、表 などが化ける)
    expect(await bytesOf(sent[0].file)).toEqual(hamlogBytes())
  })

  it('ADIF生成: 確認してから変換し、ZIP を「コールサイン_adif.zip」で保存する', async () => {
    const { sent } = mockServer({ [CHECK]: OK })
    const { names } = mockDownload()
    setup()
    generate()

    await waitFor(() => expect(names).toEqual(['JA1ZZZ-1_adif.zip']))
    expect(sent.map((s) => s.url)).toEqual([CHECK, CONVERT])
    // 変換には command を付けない
    expect(sent[1].options).toEqual({
      format: 'pota',
      myQTH: 'form',
      QTH: 'none',
      Park: 'JA-0001 JA-0002 JAFF-0001',
      POTAActivator: 'JA1ZZZ/1',
      POTAOperator: 'JA1ZZZ',
    })
    expect(await bytesOf(sent[1].file)).toEqual(hamlogBytes())
  })

  it('確認済みなら、ADIF生成で確認し直さない。指定を変えたら、確認し直す', async () => {
    const row = ['JA1AAA', '20251018', '0000', '40m', 'CW', '599', '599', '', 'JA-0001', 'JA1ZZZ/1', 'JA1ZZZ']
    const { sent } = mockServer({ [CHECK]: { ok: true, json: { status: 'OK', log_text: [row] } } })
    mockDownload()
    const { container } = setup()
    readCsv()
    // 確認の結果が画面に出てから(確認が終わってから)
    expect(await screen.findByText('JA1AAA')).toBeInTheDocument()
    generate()
    await waitFor(() => expect(sent.map((s) => s.url)).toEqual([CHECK, CONVERT]))

    chooseRadio(container, 'hisQTH', 'rmks2')
    generate()
    await waitFor(() => expect(sent.map((s) => s.url)).toEqual([CHECK, CONVERT, CHECK, CONVERT]))
    expect(sent[3].options.QTH).toBe('rmks2')
  })

  it('確認でエラーがあれば、理由を出して、ADIF は生成しない(ボタンも押せない)', async () => {
    const { sent } = mockServer({
      [CHECK]: {
        ok: true,
        json: { status: 'NG', error_log: ['2行:周波数不正:Unknown frequency: 7MHz'], log_text: [] },
      },
    })
    setup()
    generate()

    expect(await screen.findByText(/2行:周波数不正:Unknown frequency: 7MHz/)).toBeInTheDocument()
    expect(sent.map((s) => s.url)).toEqual([CHECK])
    expect(screen.getByRole('button', { name: /ADIF生成/ })).toBeDisabled()
  })

  it('サーバーが生成を断ったら(400)、error_log の理由を出す', async () => {
    mockServer({
      [CHECK]: OK,
      [CONVERT]: { ok: false, json: { status: 'NG', error_log: ['3行:日時不正:25/10/18 99:99U'] } },
    })
    setup()
    generate()
    expect(await screen.findByText(/3行:日時不正/)).toBeInTheDocument()
  })

  it.each([
    ['公園 1つ', 'JA-0001'],
    ['公園の n-fer', 'JA-0001 JA-0002 JA-0003'],
    ['WWFF と公園', 'JAFF-0005 JP-0014'],
    ['山と公園(同時運用)', 'JA/TK-001 JA-0001'],
    ['カンマ区切り・小文字', 'ja-0001,ja-0002'],
    ['5桁の公園', 'US-10995 K-0001'],
  ])('運用先の入力: %s(%s)は送る', async (_, park) => {
    const { sent } = mockServer({ [CHECK]: OK })
    setup(park)
    readCsv()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].options.Park).toBe(park.toUpperCase())
  })

  it.each([
    ['空', '', '運用先を入力してください'],
    ['書式の誤り', 'JA-01', '運用先リファレンスに誤りがあります'],
    ['6桁の番号', 'US-109951', '運用先リファレンスに誤りがあります'],
    ['参照でない語', 'JA-0001 TOKYO', '運用先リファレンスに誤りがあります'],
  ])('運用先の入力: %sは送らない', async (_, park, message) => {
    const { sent } = mockServer()
    setup(park)
    readCsv()
    expect(await screen.findByText(new RegExp(message))).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })

  it('運用先を備考で指定するときは、運用先の入力を見ない', async () => {
    const { sent } = mockServer({ [CHECK]: OK })
    const { container } = setup('')
    chooseRadio(container, 'myQTH', 'rmks2')
    chooseRadio(container, 'hisQTH', 'rmks1')
    readCsv()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].options).toMatchObject({ myQTH: 'rmks2', QTH: 'rmks1' })
  })

  it.each([
    ['rmks1', 'Remarks1の指定が重複しています'],
    ['rmks2', 'Remarks2の指定が重複しています'],
  ])('運用先と相手局が同じ備考(%s)なら、送らない', async (rmks, message) => {
    const { sent } = mockServer()
    const { container } = setup()
    chooseRadio(container, 'myQTH', rmks)
    chooseRadio(container, 'hisQTH', rmks)
    readCsv()
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })

  it('コールサインがなければ、送らない', async () => {
    const { sent } = mockServer()
    setup()
    fireEvent.change(screen.getByLabelText(/運用時のコールサイン/), { target: { value: '' } })
    readCsv()
    expect(await screen.findByText('運用時のコールサインを入力してください')).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })
})
