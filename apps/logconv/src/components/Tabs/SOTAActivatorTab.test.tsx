import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SOTAActivatorTab } from './SOTAActivatorTab'
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

beforeEach(resetPrefs)
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setup(summit = 'ja/tk-001') {
  const view = render(<SOTAActivatorTab />)
  fireEvent.change(screen.getByLabelText(/運用時のコールサイン/), { target: { value: 'ja1zzz/1' } })
  fireEvent.change(screen.getByPlaceholderText('例: JA/KN-006'), { target: { value: summit } })
  chooseFile(view.container, hamlogFile())
  return view
}

const convert = () => fireEvent.click(screen.getByRole('button', { name: /変換/ }))

describe('SOTA Activator', () => {
  it('S2S の相手局は、指定しない・Remarks1・Remarks2・QTH から選べる', () => {
    const { container } = render(<SOTAActivatorTab />)
    const values = [...container.querySelectorAll<HTMLInputElement>('input[name="hisQTH"]')].map((r) => r.value)
    expect(values).toEqual(['none', 'rmks1', 'rmks2', 'qth'])
  })

  it.each(['none', 'rmks1', 'rmks2', 'qth'])(
    '変換: 指定(相手局 %s)とファイルをそのまま送り、ZIP を保存する',
    async (his) => {
      const { sent } = mockServer()
      const { names } = mockDownload()
      const { container } = setup()
      chooseRadio(container, 'hisQTH', his)
      convert()

      await waitFor(() => expect(names).toEqual(['JA1ZZZ-1_sota_activator.zip']))
      expect(sent[0].url).toBe('/api/v2/logconv/hamlog')
      expect(sent[0].options).toEqual({
        format: 'sota_a',
        myQTH: 'form',
        QTH: his,
        Summit: 'JA/TK-001',
        SOTAActivator: 'JA1ZZZ/1',
      })
      expect(await bytesOf(sent[0].file)).toEqual(hamlogBytes())
    }
  )

  // FLE Online の HAMLOG CSV: 自局の山は入力、相手の山は QTH
  it('FLE Online の HAMLOG CSV を変換する指定(山を入力・相手局は QTH)', async () => {
    const { sent } = mockServer()
    mockDownload()
    const { container } = setup('JA/TK-001')
    chooseRadio(container, 'hisQTH', 'qth')
    convert()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].options).toMatchObject({ myQTH: 'form', Summit: 'JA/TK-001', QTH: 'qth' })
  })

  it.each([
    ['rmks1', 'rmks2'],
    ['rmks2', 'rmks1'],
    ['rmks1', 'qth'],
  ])('運用した山を備考で指定する(自局 %s・相手局 %s)', async (my, his) => {
    const { sent } = mockServer()
    mockDownload()
    const { container } = setup('')
    chooseRadio(container, 'myQTH', my)
    chooseRadio(container, 'hisQTH', his)
    convert()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0].options).toMatchObject({ myQTH: my, QTH: his })
  })

  it.each([
    ['空', '', '運用した山岳IDを入力してください'],
    ['公園', 'JA-0001', '山岳IDの形式が正しくありません'],
    ['番号が3桁でない', 'JA/TK-01', '山岳IDの形式が正しくありません'],
  ])('山岳ID: %sは送らない', async (_, summit, message) => {
    const { sent } = mockServer()
    setup(summit)
    convert()
    expect(await screen.findByText(new RegExp(message))).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })

  it.each([
    ['rmks1', 'Remarks1の指定が重複しています'],
    ['rmks2', 'Remarks2の指定が重複しています'],
  ])('運用した山と S2S の相手局が同じ備考(%s)なら、送らない', async (rmks, message) => {
    const { sent } = mockServer()
    const { container } = setup()
    chooseRadio(container, 'myQTH', rmks)
    chooseRadio(container, 'hisQTH', rmks)
    convert()
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })

  it('変換に失敗したら、知らせる', async () => {
    mockServer({ '/api/v2/logconv/hamlog': { ok: false } })
    setup()
    convert()
    expect(await screen.findByText('変換に失敗しました')).toBeInTheDocument()
  })
})
