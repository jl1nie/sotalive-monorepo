// 保存した設定(localStorage の logconv-prefs)の保存・復元と、壊れた・古い形のデータ
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { usePrefsStore } from './prefsStore'
import { POTAActivatorTab } from '@/components/Tabs/POTAActivatorTab'
import { SOTAActivatorTab } from '@/components/Tabs/SOTAActivatorTab'
import { SOTAChaserTab } from '@/components/Tabs/SOTAChaserTab'
import { chooseFile, hamlogFile, resetPrefs } from '@/test/tabs'

const KEY = 'logconv-prefs'
const save = (state: unknown, version = 0) => localStorage.setItem(KEY, JSON.stringify({ state, version }))
const restore = () => usePrefsStore.persist.rehydrate()
const saved = () => JSON.parse(localStorage.getItem(KEY) as string)

beforeEach(resetPrefs)
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const FULL = {
  theme: 'dark',
  potaActivationCall: 'JA1ZZZ/1',
  potaOperator: 'JA1YYY',
  potaPark: 'JA-0001 JAFF-0001',
  myQTHPota: 'rmks2',
  actQTHPota: 'qth',
  sotaActivationCall: 'JA1ZZZ/P',
  sotaSummit: 'JA/TK-001',
  myQTHSota: 'rmks1',
  actQTHSota: 'rmks2',
  chaserCall: 'JA1XXX',
  hisQTHChaser: 'qth',
}

describe('設定の保存', () => {
  it('入力すると、logconv-prefs に state として保存する(関数は保存しない)', () => {
    usePrefsStore.getState().setPotaActivationCall('JA1ZZZ')
    usePrefsStore.getState().setHisQTHChaser('qth')
    const { state } = saved()
    expect(state).toMatchObject({ potaActivationCall: 'JA1ZZZ', hisQTHChaser: 'qth' })
    expect(Object.values(state).some((v) => typeof v === 'function')).toBe(false)
  })

  it('画面で入力した値が保存され、読み直すと各タブに復元される', async () => {
    const first = render(<POTAActivatorTab />)
    fireEvent.change(screen.getByLabelText(/運用時のコールサイン/), { target: { value: 'ja1zzz/1' } })
    fireEvent.click(first.container.querySelector('input[name="hisQTH"][value="rmks2"]') as HTMLInputElement)
    first.unmount()

    // 値を捨ててから、保存した内容を読み直す(再読み込みに当たる)
    const stored = localStorage.getItem(KEY) as string
    usePrefsStore.setState({ potaActivationCall: '', actQTHPota: 'none' })
    localStorage.setItem(KEY, stored)
    await restore()

    const again = render(<POTAActivatorTab />)
    expect(screen.getByLabelText(/運用時のコールサイン/)).toHaveValue('JA1ZZZ/1')
    expect(again.container.querySelector<HTMLInputElement>('input[name="hisQTH"][value="rmks2"]')).toBeChecked()
  })
})

describe('設定の復元', () => {
  it('保存した全項目が、各タブの画面に出る', async () => {
    save(FULL)
    await restore()
    const pota = render(<POTAActivatorTab />)
    expect(screen.getByLabelText(/運用時のコールサイン/)).toHaveValue('JA1ZZZ/1')
    expect(screen.getByLabelText(/運用時のオペレータ/)).toHaveValue('JA1YYY')
    expect(pota.container.querySelector<HTMLInputElement>('input[name="myQTH"][value="rmks2"]')).toBeChecked()
    expect(pota.container.querySelector<HTMLInputElement>('input[name="hisQTH"][value="qth"]')).toBeChecked()
    pota.unmount()

    const sota = render(<SOTAActivatorTab />)
    expect(screen.getByLabelText(/運用時のコールサイン/)).toHaveValue('JA1ZZZ/P')
    expect(sota.container.querySelector<HTMLInputElement>('input[name="myQTH"][value="rmks1"]')).toBeChecked()
    expect(sota.container.querySelector<HTMLInputElement>('input[name="hisQTH"][value="rmks2"]')).toBeChecked()
    sota.unmount()

    const chaser = render(<SOTAChaserTab />)
    expect(chaser.container.querySelector<HTMLInputElement>('input[type="text"]')).toHaveValue('JA1XXX')
    expect(chaser.container.querySelector<HTMLInputElement>('input[name="hisQTH"][value="qth"]')).toBeChecked()
  })

  it('form のときは、保存した Park・Summit が入力欄に出る', async () => {
    save({ ...FULL, myQTHPota: 'form', myQTHSota: 'form' })
    await restore()
    const pota = render(<POTAActivatorTab />)
    expect(screen.getByPlaceholderText('例: JAFF-0005 JP-0014')).toHaveValue('JA-0001 JAFF-0001')
    pota.unmount()
    render(<SOTAActivatorTab />)
    expect(screen.getByPlaceholderText('例: JA/KN-006')).toHaveValue('JA/TK-001')
  })

  it('古い形(項目の一部だけ)の保存データは、足りない項目を既定にして読む', async () => {
    save({ potaActivationCall: 'JA1ZZZ' })
    await restore()
    const s = usePrefsStore.getState()
    expect(s.potaActivationCall).toBe('JA1ZZZ')
    expect(s.myQTHPota).toBe('form')
    expect(s.actQTHPota).toBe('none')
    expect(s.hisQTHChaser).toBe('rmks1')
    expect(typeof s.setPotaActivationCall).toBe('function')
    render(<POTAActivatorTab />)
    expect(screen.getByLabelText(/運用時のコールサイン/)).toHaveValue('JA1ZZZ')
  })

  it('知らない項目(今はない設定)が混ざっていても、画面は出る', async () => {
    save({ ...FULL, legacyField: 1, portable: 'yes', note: 'form' })
    await restore()
    render(<POTAActivatorTab />)
    expect(screen.getByLabelText(/運用時のコールサイン/)).toHaveValue('JA1ZZZ/1')
  })

  it('保存データの version が違っても(将来・過去)、画面は出る', async () => {
    save(FULL, 99)
    await restore()
    render(<SOTAChaserTab />)
    expect(screen.getByRole('button', { name: /変換/ })).toBeInTheDocument()
  })
})

describe('壊れた保存データ', () => {
  it.each([
    ['JSON でない', '{not json'],
    ['空文字', ''],
    ['null', 'null'],
    ['配列', '[]'],
    ['数値', '42'],
    ['state がない', '{"version":0}'],
    ['state が null', '{"state":null,"version":0}'],
    ['state が文字列', '{"state":"x","version":0}'],
  ])('%s でも、既定の設定で画面が出る', async (_, raw) => {
    localStorage.setItem(KEY, raw)
    await Promise.resolve(restore()).catch(() => undefined)
    const pota = render(<POTAActivatorTab />)
    expect(screen.getByLabelText(/運用時のコールサイン/)).toHaveValue('')
    pota.unmount()
    render(<SOTAChaserTab />)
    expect(screen.getByRole('button', { name: /変換/ })).toBeInTheDocument()
  })

  it('値の型が違う(文字列の項目が数値)と、文字列として扱える範囲で画面が出る', async () => {
    save({ ...FULL, potaActivationCall: 123, potaPark: 45 })
    await restore()
    expect(() => render(<POTAActivatorTab />)).not.toThrow()
  })

  // 項目が null だと、画面は出るが、ボタンを押したときに .trim() で例外になり、何も表示されず何も起きない
  it.each([
    ['POTA/ADIF', POTAActivatorTab, 'potaActivationCall', /CSV読込/],
    ['SOTA Activator', SOTAActivatorTab, 'sotaActivationCall', /変換/],
    ['SOTA Chaser', SOTAChaserTab, 'chaserCall', /変換/],
  ])('%s: コールサインが null の保存データでも、押すと「入力してください」を出す', async (_, Tab, key, button) => {
    const onError = (e: ErrorEvent) => e.preventDefault()
    window.addEventListener('error', onError)
    try {
      save({ ...FULL, [key]: null })
      await restore()
      const view = render(<Tab />)
      chooseFile(view.container, hamlogFile())
      fireEvent.click(screen.getByRole('button', { name: button }))
      expect(await screen.findByText(/コールサインを入力してください/)).toBeInTheDocument()
    } finally {
      window.removeEventListener('error', onError)
    }
  })

  it('選択肢が知らない値(旧版の adif など)でも、画面は出る。既定の選択肢が選ばれる', async () => {
    save({ ...FULL, myQTHPota: 'adif', actQTHPota: 'bogus' })
    await restore()
    const pota = render(<POTAActivatorTab />)
    expect(pota.container.querySelector<HTMLInputElement>('input[name="myQTH"][value="form"]')).toBeChecked()
    expect(pota.container.querySelector<HTMLInputElement>('input[name="hisQTH"][value="none"]')).toBeChecked()
  })

  // 画面に出ない値は、そのまま API に送られる(バックエンドは未知の myQTH を form、QTH を none とみなす)
  it('選択肢が知らない値の保存データは、既定の選択に直す', async () => {
    save({ ...FULL, myQTHPota: 'adif', actQTHPota: 'bogus' })
    await restore()
    const s = usePrefsStore.getState()
    expect(s.myQTHPota).toBe('form')
    expect(s.actQTHPota).toBe('none')
  })

  it('localStorage が使えなくても(読み出しで例外)、画面は出る', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    await Promise.resolve(restore()).catch(() => undefined)
    render(<SOTAActivatorTab />)
    expect(screen.getByLabelText(/運用時のコールサイン/)).toHaveValue('')
  })

  it('localStorage に書けなくても(容量超過など)、入力は画面の状態に反映される', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    try {
      usePrefsStore.getState().setChaserCall('JA1ZZZ')
    } catch {
      // 下の it.fails を参照
    }
    expect(usePrefsStore.getState().chaserCall).toBe('JA1ZZZ')
  })

  // zustand の persist は、書き込みの例外を握りつぶさない。入力のたびに例外が出る(状態は更新される)
  it('localStorage に書けなくても、入力で例外を出さない', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => usePrefsStore.getState().setChaserCall('JA1ZZZ')).not.toThrow()
  })
})
