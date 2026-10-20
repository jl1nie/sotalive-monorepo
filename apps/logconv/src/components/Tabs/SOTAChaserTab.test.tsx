import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SOTAChaserTab } from './SOTAChaserTab'
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

describe('SOTA Chaser', () => {
  it.each(['rmks1', 'rmks2', 'qth'])(
    '変換: 指定(相手局 %s)とファイルをそのまま送り、ZIP を保存する',
    async (his) => {
      const { sent } = mockServer()
      const { names } = mockDownload()
      const { container } = render(<SOTAChaserTab />)
      fireEvent.change(container.querySelector('input[type="text"]') as HTMLInputElement, {
        target: { value: 'ja1zzz' },
      })
      chooseRadio(container, 'hisQTH', his)
      chooseFile(container, hamlogFile())
      fireEvent.click(screen.getByRole('button', { name: /変換/ }))

      await waitFor(() => expect(names).toHaveLength(1))
      expect(sent[0].url).toBe('/api/v2/logconv/hamlog')
      expect(sent[0].options).toEqual({ format: 'sota_c', QTH: his, callsign: 'JA1ZZZ' })
      expect(await bytesOf(sent[0].file)).toEqual(hamlogBytes())
    }
  )
})
