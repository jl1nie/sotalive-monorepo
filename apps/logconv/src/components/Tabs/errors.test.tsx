// API の失敗(400・500・通信の失敗・時間切れ・中身のない 200)と、画面の戻り方、ダウンロードのファイル名
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { POTAActivatorTab } from './POTAActivatorTab'
import { SOTAActivatorTab } from './SOTAActivatorTab'
import { SOTAChaserTab } from './SOTAChaserTab'
import { chooseFile, chooseRadio, hamlogFile, mockDownload, resetPrefs } from '@/test/tabs'

beforeEach(resetPrefs)
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

type Step =
  | { status: number; json?: unknown; text?: string }
  | { throws: unknown }
  | { hangs: true }

/** fetch を、呼ばれた順に決めた応答で差し替える(足りなければ最後の応答) */
function stubFetch(steps: Step[]) {
  let n = 0
  const fetchMock = vi.fn(async () => {
    const step = steps[Math.min(n++, steps.length - 1)]
    if ('throws' in step) throw step.throws
    if ('hangs' in step) return new Promise<Response>(() => {})
    const ok = step.status >= 200 && step.status < 300
    return {
      ok,
      status: step.status,
      json: async () => {
        if (step.json === undefined) throw new SyntaxError('Unexpected token < in JSON')
        return step.json
      },
      blob: async () => new Blob([step.text ?? 'PK'], { type: 'application/zip' }),
    } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

interface TabCase {
  name: string
  /** 画面を出して、送れる状態にして、押すボタンを返す */
  setup: () => { container: HTMLElement; button: () => HTMLElement }
  /** 変換の応答が来る呼び出しの番号(POTA は 確認 → 生成 の2回目) */
  convertAt: number
  zip: string
}

const tabs: TabCase[] = [
  {
    name: 'POTA/ADIF',
    convertAt: 1,
    zip: 'JA1ZZZ_adif.zip',
    setup: () => {
      const { container } = render(<POTAActivatorTab />)
      fireEvent.change(screen.getByLabelText(/運用時のコールサイン/), { target: { value: 'ja1zzz' } })
      chooseRadio(container, 'myQTH', 'rmks1')
      chooseFile(container, hamlogFile())
      return { container, button: () => screen.getByRole('button', { name: /ADIF生成/ }) }
    },
  },
  {
    name: 'SOTA Activator',
    convertAt: 0,
    zip: 'JA1ZZZ_sota_activator.zip',
    setup: () => {
      const { container } = render(<SOTAActivatorTab />)
      fireEvent.change(screen.getByLabelText(/運用時のコールサイン/), { target: { value: 'ja1zzz' } })
      chooseRadio(container, 'myQTH', 'rmks1')
      chooseFile(container, hamlogFile())
      return { container, button: () => screen.getByRole('button', { name: /変換/ }) }
    },
  },
  {
    name: 'SOTA Chaser',
    convertAt: 0,
    zip: 'JA1ZZZ_sota_chaser.zip',
    setup: () => {
      const { container } = render(<SOTAChaserTab />)
      fireEvent.change(container.querySelector('input[type="text"]') as HTMLInputElement, { target: { value: 'ja1zzz' } })
      chooseFile(container, hamlogFile())
      return { container, button: () => screen.getByRole('button', { name: /変換/ }) }
    },
  },
]

/** 変換の呼び出しまでの前置き(POTA は確認が先に通る) */
const OK_CHECK: Step = { status: 200, json: { status: 'OK', log_text: [] } }
const upTo = (t: TabCase, step: Step): Step[] => (t.convertAt === 1 ? [OK_CHECK, step] : [step])

/** ボタンが押せる状態に戻っている(固まっていない) */
const expectUsable = (t: ReturnType<TabCase['setup']>) => expect(t.button()).toBeEnabled()

describe.each(tabs)('失敗の扱い: $name', (tab) => {
  it.each([
    [500, { status: 'NG', error: 'ZIP creation failed: x' }],
    [500, undefined],
    [502, undefined],
    [413, undefined],
  ])('HTTP %i(本文 %j)なら、日本語のメッセージを出し、ボタンは使える状態に戻る', async (status, json) => {
    stubFetch(upTo(tab, { status, json }))
    mockDownload()
    const view = tab.setup()
    fireEvent.click(view.button())
    const alert = await screen.findByText(/失敗しました/)
    expect(alert).toBeInTheDocument()
    // 英語の生の例外(SyntaxError など)は見せない
    expect(document.body.textContent).not.toMatch(/Unexpected token|SyntaxError/)
    await waitFor(() => expectUsable(view))
  })

  it('通信の失敗(fetch が TypeError)でも、メッセージを出し、ボタンは使える状態に戻る', async () => {
    stubFetch(upTo(tab, { throws: new TypeError('Failed to fetch') }))
    const view = tab.setup()
    fireEvent.click(view.button())
    expect(await screen.findByText(/サーバーに接続できませんでした/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Failed to fetch')
    await waitFor(() => expectUsable(view))
  })

  it('例外が Error でないときは、「エラーが発生しました」を出す', async () => {
    stubFetch(upTo(tab, { throws: 'boom' }))
    const view = tab.setup()
    fireEvent.click(view.button())
    expect(await screen.findByText('エラーが発生しました')).toBeInTheDocument()
    await waitFor(() => expectUsable(view))
  })

  it('失敗のあとで、同じ画面からやり直せる(エラーが消え、保存される)', async () => {
    const names = mockDownload().names
    stubFetch([...upTo(tab, { status: 500 }), ...upTo(tab, { status: 200 })])
    const view = tab.setup()
    fireEvent.click(view.button())
    await screen.findByText(/失敗しました/)
    await waitFor(() => expectUsable(view))
    fireEvent.click(view.button())
    await waitFor(() => expect(names).toEqual([tab.zip]))
    expect(screen.queryByText(/失敗しました/)).not.toBeInTheDocument()
  })

  // 時間切れ: いまの画面には中断(AbortController)も時間切れもなく、応答がなければ永久に待つ
  it('応答が返らないとき、一定の時間でメッセージを出し、ボタンを使える状態に戻す', async () => {
    vi.useFakeTimers()
    stubFetch(upTo(tab, { hangs: true }))
    const view = tab.setup()
    fireEvent.click(view.button())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    })
    expectUsable(view)
    expect(document.body.textContent).toMatch(/時間|タイムアウト/)
  })

  it('変換中は、ボタンを押せない(二重に送らない)', async () => {
    const fetchMock = stubFetch(upTo(tab, { hangs: true }))
    const view = tab.setup()
    fireEvent.click(view.button())
    await waitFor(() => expect(view.button()).toBeDisabled())
    fireEvent.click(view.button())
    expect(fetchMock).toHaveBeenCalledTimes(tab.convertAt + 1)
  })

  // 参照が1つもないとき、バックエンドは 200 の JSON({status:'OK', error:'No ... found'})を返す(ZIP ではない)
  it('変換結果がなく 200 の JSON が返ったとき、ZIP として保存せず、理由を出す', async () => {
    const { names } = mockDownload()
    const body = { status: 'OK', error: 'No SOTA references found' }
    const jsonReply = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => body,
      blob: async () => new Blob([JSON.stringify(body)], { type: 'application/json' }),
    }
    const checkReply = { ...jsonReply, json: async () => ({ status: 'OK', log_text: [] }) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(tab.convertAt === 1 ? checkReply : jsonReply).mockResolvedValue(jsonReply))
    const view = tab.setup()
    fireEvent.click(view.button())
    await waitFor(() => expectUsable(view))
    expect(names).toEqual([])
    expect(document.body.textContent).toMatch(/参照|見つかりません|ありません/)
  })
})

describe('400 の理由の表示', () => {
  const reasons = ['2行:周波数不正:Unknown frequency: 7MHz', '5行:日時不正:25/13/40 99:99U']

  it('POTA 確認: error_log を、全部出す', async () => {
    stubFetch([{ status: 200, json: { status: 'NG', error_log: reasons, log_text: [] } }])
    const view = tabs[0].setup()
    fireEvent.click(view.button())
    const text = (await screen.findByText(/CSVファイルにエラーがあります/)).textContent
    for (const r of reasons) expect(text).toContain(r)
    // 直すまで生成できない。ボタンは押せない
    expect(view.button()).toBeDisabled()
  })

  it('POTA 生成が 400(error_log つき)なら、全部出し、確認し直せる', async () => {
    stubFetch([OK_CHECK, { status: 400, json: { status: 'NG', error: 'The log has errors', error_log: reasons } }])
    const view = tabs[0].setup()
    fireEvent.click(view.button())
    const text = (await screen.findByText(/CSVファイルにエラーがあります/)).textContent
    for (const r of reasons) expect(text).toContain(r)
    await waitFor(() => expect(screen.getByRole('button', { name: /CSV読込/ })).toBeEnabled())
  })

  it('POTA 確認が NG で、error_log が空でも、error の文を出す', async () => {
    stubFetch([{ status: 200, json: { status: 'NG', error: 'Invalid options JSON: x' } }])
    const view = tabs[0].setup()
    fireEvent.click(view.button())
    expect(await screen.findByText(/Invalid options JSON: x/)).toBeInTheDocument()
  })

  it('POTA 確認が NG で、理由が何もないとき、「不明なエラー」を出す', async () => {
    stubFetch([{ status: 200, json: { status: 'NG' } }])
    const view = tabs[0].setup()
    fireEvent.click(view.button())
    expect(await screen.findByText(/不明なエラー/)).toBeInTheDocument()
  })

  it('POTA 確認が 400(error のみ)なら、「解析に失敗しました」を出す', async () => {
    stubFetch([{ status: 400, json: { status: 'NG', error: 'Missing file' } }])
    const view = tabs[0].setup()
    fireEvent.click(screen.getByRole('button', { name: /CSV読込/ }))
    expect(await screen.findByText('CSVファイルの解析に失敗しました')).toBeInTheDocument()
    expect(view.button()).toBeEnabled()
  })

  // SOTA の 400 は理由(error・error_log)を返すが、画面は固定の文言で捨てている
  it.each([tabs[1], tabs[2]])('$name: 400 の error_log を、利用者に見せる', async (tab) => {
    stubFetch([{ status: 400, json: { status: 'NG', error: 'The log has errors', error_log: reasons } }])
    const view = tab.setup()
    fireEvent.click(view.button())
    await waitFor(() => expectUsable(view))
    expect(document.body.textContent).toContain(reasons[0])
  })

  it.each([tabs[1], tabs[2]])('$name: 400 の error だけでも、その理由を見せる', async (tab) => {
    stubFetch([{ status: 400, json: { status: 'NG', error: 'Invalid options JSON: x' } }])
    const view = tab.setup()
    fireEvent.click(view.button())
    await waitFor(() => expectUsable(view))
    expect(document.body.textContent).toContain('Invalid options JSON: x')
  })
})

describe('ダウンロードのファイル名', () => {
  const run = async (tab: TabCase, call: string) => {
    const { names } = mockDownload()
    stubFetch(upTo(tab, { status: 200 }))
    const view = tab.setup()
    const input =
      tab.name === 'SOTA Chaser'
        ? (view.container.querySelector('input[type="text"]') as HTMLInputElement)
        : screen.getByLabelText(/運用時のコールサイン/)
    fireEvent.change(input, { target: { value: call } })
    fireEvent.click(view.button())
    await waitFor(() => expect(names).toHaveLength(1))
    return names[0]
  }
  const suffix = ['_adif.zip', '_sota_activator.zip', '_sota_chaser.zip']

  it.each(tabs.map((t, i) => [t.name, t, suffix[i]] as const))('%s: / を - にし、小文字は大文字にする', async (_, tab, suf) => {
    expect(await run(tab, 'ja1zzz/p')).toBe(`JA1ZZZ-P${suf}`)
  })

  it.each(tabs.map((t, i) => [t.name, t, suffix[i]] as const))('%s: 複数の / もすべて - にする', async (_, tab, suf) => {
    expect(await run(tab, 'dl/ja1zzz/p')).toBe(`DL-JA1ZZZ-P${suf}`)
  })

  it.each(tabs.map((t, i) => [t.name, t, suffix[i]] as const))('%s: ファイル名に空白を入れない', async (_, tab, suf) => {
    expect(await run(tab, ' ja1zzz ')).toBe(`JA1ZZZ${suf}`)
  })
})
