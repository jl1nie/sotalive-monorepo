// @vitest-environment jsdom
// 事前に `pnpm wasm` で src/wasm/fle を生成しておくこと。
// 正解は docs/apps/fle-editor.md。テストの名前の番号(A1 など)は、その項目。
// ログの解釈は本物のコア(WASM)に任せる。端末の外(Service Worker・地図の保存・通信)だけを差し替える
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { initSync } from '@/wasm/fle/fle'
import { translator } from '@/lib/i18n'
import { resetNet } from '@/lib/net'
import { refreshRegionOf } from '@/lib/mapStore'
import { alignToBottom } from '@/lib/caretScroll'
import { FleEditor } from './FleEditor'

vi.mock('@/hooks/usePwa', () => ({
  usePwa: () => ({ canInstall: false, showIosHint: false, install: () => {} }),
}))
vi.mock('@/hooks/usePlanMaps', () => ({
  usePlanMaps: () => ({ statusOf: () => null }),
}))

/** テストから切り替える差し替え(vi.mock の中から見えるように、先に作る) */
const hooks = vi.hoisted(() => ({
  /** ログの解釈を失敗させる(A6) */
  failCompile: false,
  /** 同期が設定を書き換えるときの入口(J3) */
  syncUpdate: null as ((patch: Record<string, unknown>) => void) | null,
}))
vi.mock('@/lib/fle', async (importOriginal) => {
  const m = await importOriginal<typeof import('@/lib/fle')>()
  return {
    ...m,
    compileLog: (text: string) => (hooks.failCompile ? Promise.reject(new Error('compile broke')) : m.compileLog(text)),
  }
})
vi.mock('@/hooks/useSync', async (importOriginal) => {
  const m = await importOriginal<typeof import('@/hooks/useSync')>()
  return {
    useSync: (opts: Parameters<typeof m.useSync>[0]) => {
      hooks.syncUpdate = opts.update as (patch: Record<string, unknown>) => void
      return m.useSync(opts)
    },
  }
})
// 地図の保存(IndexedDB と通信)は、結果だけを返す(G8)
vi.mock('@/lib/mapStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mapStore')>()),
  refreshRegionOf: vi.fn(),
}))
// 地図のシートは、どの山頂で開いたかだけを見る(G9)
vi.mock('@/components/MapSheet', () => ({
  MapSheet: ({ open, summit }: { open: boolean; summit: string }) => (open ? <div data-testid="map-sheet">{summit}</div> : null),
}))
// jsdom には大きさがないので、時計が入るかは「出す条件」だけで決める(K5)
vi.mock('@/hooks/useClockRoom', async (importOriginal) => {
  const m = await importOriginal<typeof import('@/hooks/useClockRoom')>()
  return {
    ...m,
    useClockRoom: (opts: Parameters<typeof m.useClockRoom>[0]) => ({ ...m.useClockRoom(opts), fits: opts.enabled }),
  }
})
// 打っている行を下端に寄せたか(K6)
vi.mock('@/lib/caretScroll', async (importOriginal) => {
  const m = await importOriginal<typeof import('@/lib/caretScroll')>()
  return { ...m, alignToBottom: vi.fn(m.alignToBottom) }
})

const t = translator('ja')

beforeAll(() => {
  // jsdom の <dialog> には showModal・close がない(シートは <dialog> で開く)
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
  // jsdom では import.meta.url が file: でないので、場所はこのファイルから求める
  initSync({ module: readFileSync(path.resolve(__dirname, '../wasm/fle/fle_bg.wasm')) })
})

/** jsdom には matchMedia がない。`coarse` ならタッチ端末(フルキー) */
function media(coarse = false) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: coarse && q === '(pointer: coarse)',
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))
}

beforeEach(() => {
  localStorage.clear()
  hooks.failCompile = false
  vi.mocked(refreshRegionOf).mockReset().mockResolvedValue('current')
  vi.mocked(alignToBottom).mockClear()
  resetNet()
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
  media()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/**
 * 端末に保存したログと設定で開く。ログの解釈が届くまで待つ。
 * RST は、書かない設定を既定にする(書くかは C1 で確かめる。期待するログを短くするため)
 */
async function open(log = '', settings: Record<string, unknown> = {}) {
  if (log) localStorage.setItem('fle.log', log)
  const all = { language: 'ja', writeRst: false, writeRstCompact: false, ...settings }
  localStorage.setItem('fle.settings', JSON.stringify(all))
  render(<FleEditor />)
  const label = translator(all.language === 'en' ? 'en' : 'ja')('editor.label')
  const ta = screen.getByRole('textbox', { name: label }) as HTMLTextAreaElement
  // 解釈(非同期)が一巡するまで
  await act(async () => {})
  return ta
}

/** 打ったのと同じ(値とキャレット)。キャレットは、省けば末尾 */
async function type(ta: HTMLTextAreaElement, value: string, pos = value.length) {
  await act(async () => {
    fireEvent.change(ta, { target: { value, selectionStart: pos, selectionEnd: pos } })
  })
}

/** キャレットだけを動かす */
async function moveTo(ta: HTMLTextAreaElement, pos: number) {
  await act(async () => {
    ta.setSelectionRange(pos, pos)
    fireEvent.select(ta)
  })
}

const okButton = () => screen.getByRole('button', { name: t('bar.confirmLabel') })

/** 緑の OK を押す(押せるようになるまで待つ) */
async function confirm() {
  await waitFor(() => expect(okButton()).toBeEnabled())
  await act(async () => {
    fireEvent.click(okButton())
  })
  await act(async () => {})
}

/** メニューを開き、そのシート(通知の「元に戻す」と、メニューの「元に戻す」を分けるため) */
async function openMenu() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: t('header.menu') }))
  })
  return within(document.querySelector('dialog[open]') as HTMLElement)
}

async function menu(label: string) {
  const sheet = await openMenu()
  await act(async () => {
    fireEvent.click(sheet.getByRole('button', { name: label }))
  })
  await act(async () => {})
}

/** 通知(画面の下の知らせ)。なければ null */
const noticeOf = (text: string) => screen.queryAllByRole('status').find((el) => el.textContent?.includes(text)) ?? null

/** いまの時刻を決める(Date だけを止める。タイマーは本物) */
function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

const HEADER = 'mycall JA1ABC\ndate 2026-10-27\nmysota JA/TK-001\n40m cw\n'

describe('A. 起動と保存', () => {
  it('A1: 保存してあったログを開き、カーソルは末尾。フォーカスはしない', async () => {
    const ta = await open(HEADER + '1000 ja1xyz')
    expect(ta.value).toBe(HEADER + '1000 ja1xyz')
    expect(ta.selectionStart).toBe(ta.value.length)
    expect(document.activeElement).not.toBe(ta)
  })

  it('A2: 打ったら、少し待ってから端末に保存する', async () => {
    const ta = await open()
    await type(ta, 'mycall JA1ABC')
    expect(localStorage.getItem('fle.log')).toBeNull()
    await waitFor(() => expect(localStorage.getItem('fle.log')).toBe('mycall JA1ABC'))
  })

  it('A3・I3: timezone の行のないログを開くと、時間帯を一度だけ聞く。UTC と答えると、先頭に行を足すだけ', async () => {
    const log = HEADER + '1000 ja1xyz'
    const ta = await open(log, { timezone: 9 })
    await waitFor(() => expect(screen.getByRole('button', { name: t('zoneAsk.utc') })).toBeInTheDocument())
    await moveTo(ta, 3)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('zoneAsk.utc') }))
    })
    expect(ta.value).toBe('timezone utc\n' + log)
    // カーソルは同じ文字の上
    expect(ta.selectionStart).toBe('timezone utc\n'.length + 3)
    // 通知の「元に戻す」は、行を足す前に戻す
    const notice = noticeOf(t('notice.relabeled', { zone: 'UTC' }))!
    await act(async () => {
      fireEvent.click(within(notice).getByRole('button', { name: t('notice.undo') }))
    })
    expect(ta.value).toBe(log)
  })

  it('I3(Q6): 時間帯の答えを「元に戻す」で取り消すと、カーソルは答える前の位置。フォーカスはしない', async () => {
    const log = HEADER + '1000 ja1xyz'
    const ta = await open(log, { timezone: 9 })
    await waitFor(() => expect(screen.getByRole('button', { name: t('zoneAsk.utc') })).toBeInTheDocument())
    await moveTo(ta, 3)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('zoneAsk.utc') }))
    })
    await act(async () => ta.blur())
    await act(async () => {
      fireEvent.click(within(noticeOf(t('notice.relabeled', { zone: 'UTC' }))!).getByRole('button', { name: t('notice.undo') }))
    })
    expect(ta.value).toBe(log)
    expect(ta.selectionStart).toBe(3)
    expect(document.activeElement).not.toBe(ta)
  })

  it('A3: 設定が UTC なら、聞かない', async () => {
    await open(HEADER + '1000 ja1xyz', { timezone: 0 })
    expect(screen.queryByRole('button', { name: t('zoneAsk.utc') })).toBeNull()
  })

  it('A5: 表示言語を <html lang> に入れる', async () => {
    await open('', { language: 'en' })
    expect(document.documentElement.lang).toBe('en')
  })
})

describe('B. 入力と行の時刻', () => {
  it('B1: 行の時刻は、その行の最初の1文字を打った時刻', async () => {
    at('2026-10-27T10:00:00Z')
    const ta = await open(HEADER)
    await type(ta, HEADER + 'j')
    vi.setSystemTime(new Date('2026-10-27T10:05:00Z'))
    await type(ta, HEADER + 'ja1xyz')
    await confirm()
    expect(ta.value.split('\n')[4]).toMatch(/^1000 ja1xyz/)
  })

  it('B1: 行を空にすると、打ち始めの時刻を忘れる', async () => {
    at('2026-10-27T10:00:00Z')
    const ta = await open(HEADER)
    await type(ta, HEADER + 'j')
    await type(ta, HEADER)
    vi.setSystemTime(new Date('2026-10-27T10:05:00Z'))
    await type(ta, HEADER + 'ja1xyz')
    await confirm()
    expect(ta.value.split('\n')[4]).toMatch(/^1005 ja1xyz/)
  })

  it('B2: 相手のリファレンスがある行は、設定がオンなら OK を押した時刻', async () => {
    at('2026-10-27T10:00:00Z')
    const ta = await open(HEADER)
    await type(ta, HEADER + 'j')
    vi.setSystemTime(new Date('2026-10-27T10:05:00Z'))
    await type(ta, HEADER + 'ja1xyz ja/kn-001')
    await confirm()
    expect(ta.value.split('\n')[4]).toMatch(/^1005 ja1xyz/)
  })

  it('B2: 設定がオフなら、相手のリファレンスがあっても打ち始めの時刻', async () => {
    at('2026-10-27T10:00:00Z')
    const ta = await open(HEADER, { okTimeForRef: false })
    await type(ta, HEADER + 'j')
    vi.setSystemTime(new Date('2026-10-27T10:05:00Z'))
    await type(ta, HEADER + 'ja1xyz ja/kn-001')
    await confirm()
    expect(ta.value.split('\n')[4]).toMatch(/^1000 ja1xyz/)
  })

  it('B3: 改行は、改行するだけ(時刻などは書かない)', async () => {
    const ta = await open(HEADER)
    await type(ta, HEADER + 'ja1xyz\n')
    expect(ta.value).toBe(HEADER + 'ja1xyz\n')
  })
})

describe('C. OK(確定)', () => {
  it('C1: RST は、配置ごとの設定で書く(従来は writeRst)', async () => {
    const ta = await open(HEADER + '1000 ja1xyz', { writeRst: true })
    await confirm()
    expect(ta.value).toBe(HEADER + '1000 ja1xyz 599 599\n')
  })

  it('C1: フルキーでは writeRstCompact で決める(従来の設定は見ない)', async () => {
    media(true)
    const ta = await open(HEADER + '1000 ja1xyz', { writeRst: true, writeRstCompact: false })
    await confirm()
    expect(ta.value).toBe(HEADER + '1000 ja1xyz\n')
  })

  it('C2: 最後の行なら、改行して新しい行へ', async () => {
    const ta = await open(HEADER + '1000 ja1xyz')
    await confirm()
    expect(ta.value).toBe(HEADER + '1000 ja1xyz\n')
    expect(ta.selectionStart).toBe(ta.value.length)
  })

  it('C2: 次の行があれば、その行末へ移るだけ(行は増えない)', async () => {
    const log = HEADER + '1000 ja1xyz\n1001 ja2xyz'
    const ta = await open(log)
    await moveTo(ta, HEADER.length + 3)
    await confirm()
    expect(ta.value).toBe(log)
    expect(ta.selectionStart).toBe(log.length)
  })

  describe('日またぎ(手で打った時刻)', () => {
    const before = HEADER + '2358 ja1xyz\n0002 ja2xyz'

    it('C3: day + を入れ、行の上に知らせと「元に戻す」を出す。「元に戻す」は OK を押す前のログに戻す', async () => {
      const ta = await open(before)
      await confirm()
      expect(ta.value).toBe(HEADER + '2358 ja1xyz\nday +\n0002 ja2xyz\n')
      const notice = noticeOf(t('notice.newDay'))!
      expect(notice).not.toBeNull()
      await act(async () => {
        fireEvent.click(within(notice).getByRole('button', { name: t('notice.undo') }))
      })
      expect(ta.value).toBe(before)
    })

    it('C3(Q4): 「元に戻す」のあと、カーソルは OK を押す前の位置で、フォーカスする', async () => {
      const ta = await open(before)
      await moveTo(ta, before.length - 2)
      await confirm()
      await act(async () => ta.blur())
      await act(async () => {
        fireEvent.click(within(noticeOf(t('notice.newDay'))!).getByRole('button', { name: t('notice.undo') }))
      })
      expect(ta.selectionStart).toBe(before.length - 2)
      expect(document.activeElement).toBe(ta)
    })
  })

  describe('日付が変わってから、いまの時刻で書いた', () => {
    const before = HEADER + '2350 ja1xyz\nja2xyz'

    it('C4: day + を入れたことを通知し、「元に戻す」は OK を押す前のログに戻す', async () => {
      at('2026-10-28T00:10:00Z')
      const ta = await open(before)
      await confirm()
      expect(ta.value).toBe(HEADER + '2350 ja1xyz\nday +\n0010 ja2xyz\n')
      const notice = noticeOf(t('notice.dateInserted', { directive: 'day +' }))!
      await act(async () => {
        fireEvent.click(within(notice).getByRole('button', { name: t('notice.undo') }))
      })
      expect(ta.value).toBe(before)
    })

    it('C4(Q4): 「元に戻す」のあと、カーソルは OK を押す前の位置で、フォーカスする', async () => {
      at('2026-10-28T00:10:00Z')
      const ta = await open(before)
      await moveTo(ta, before.length - 2)
      await confirm()
      await act(async () => ta.blur())
      const notice = noticeOf(t('notice.dateInserted', { directive: 'day +' }))!
      await act(async () => {
        fireEvent.click(within(notice).getByRole('button', { name: t('notice.undo') }))
      })
      expect(ta.selectionStart).toBe(before.length - 2)
      expect(document.activeElement).toBe(ta)
    })
  })

  it('C6: 手で打った時刻が前の QSO より前に戻ったら、day + のボタンを出す。押すと、その行の前に入れる', async () => {
    const ta = await open(HEADER + '1030 ja1xyz\n0930 ja2xyz')
    const hint = await screen.findByText(t('timeBack.hint'))
    const caret = ta.selectionStart
    await act(async () => {
      fireEvent.click(within(hint.parentElement!).getByRole('button', { name: 'day +' }))
    })
    expect(ta.value).toBe(HEADER + '1030 ja1xyz\nday +\n0930 ja2xyz')
    expect(ta.selectionStart).toBe(caret + 'day +\n'.length)
  })
})

describe('D. 候補バー', () => {
  it('D1: コールを押すと、ログ欄のコールの末尾へキャレットを移す', async () => {
    const ta = await open(HEADER + '1000 ja1xyz 599 579')
    await waitFor(() => expect(screen.getAllByRole('button', { name: t('bar.selectCall') })[0]).toBeInTheDocument())
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: t('bar.selectCall') })[0])
    })
    expect(ta.selectionStart).toBe(HEADER.length + '1000 ja1xyz'.length)
    expect(ta.selectionEnd).toBe(ta.selectionStart)
  })
})

describe('E. 取り消し', () => {
  const undoKey = async (ta: HTMLTextAreaElement, init: KeyboardEventInit = {}) => {
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'z', ctrlKey: true, ...init })
    })
  }

  it('E2: 続けて打った分は、1 回で打ち始める前に戻る', async () => {
    const ta = await open(HEADER)
    await type(ta, HEADER + 'j')
    await type(ta, HEADER + 'ja')
    await type(ta, HEADER + 'ja1')
    await undoKey(ta)
    expect(ta.value).toBe(HEADER)
  })

  it('E2: ⌫ を続けて押した分は、前の行まで消していても、1 回で消し始める前に戻る', async () => {
    const log = HEADER + '1000 ja1xyz\nja2'
    const ta = await open(log)
    let text = log
    while (text.length > HEADER.length + 8) {
      text = text.slice(0, -1)
      await type(ta, text)
    }
    await undoKey(ta)
    expect(ta.value).toBe(log)
  })

  it('E2: 打つ行が変わると、次のまとまり(1 行ずつ戻る)', async () => {
    const ta = await open(HEADER)
    await type(ta, HEADER + 'ja1xyz')
    await type(ta, HEADER + 'ja1xyz\n')
    await type(ta, HEADER + 'ja1xyz\nja2')
    await undoKey(ta)
    expect(ta.value).toBe(HEADER + 'ja1xyz\n')
    await undoKey(ta)
    expect(ta.value).toBe(HEADER)
  })

  it('E1: Shift・Alt つきの Ctrl+Z は、取り消しにしない', async () => {
    const ta = await open(HEADER)
    await type(ta, HEADER + 'ja1')
    await undoKey(ta, { shiftKey: true })
    await undoKey(ta, { altKey: true })
    expect(ta.value).toBe(HEADER + 'ja1')
    await undoKey(ta, { ctrlKey: false, metaKey: true })
    expect(ta.value).toBe(HEADER)
  })

  it('E3: OK で書き足した分も取り消せる', async () => {
    const ta = await open(HEADER + '1000 ja1xyz')
    await confirm()
    expect(ta.value).not.toBe(HEADER + '1000 ja1xyz')
    await undoKey(ta)
    expect(ta.value).toBe(HEADER + '1000 ja1xyz')
  })
})

describe('F. ログの置き換えと「元に戻す」', () => {
  it('F1・F2: すべて消すと、通知に「元に戻す」を添える。押すと元のログに戻す', async () => {
    const log = HEADER + '1000 ja1xyz'
    const ta = await open(log)
    await menu(t('menu.clear'))
    expect(ta.value).toBe('')
    expect(localStorage.getItem('fle.log.prev')).toBe(log)
    const notice = noticeOf(t('notice.cleared'))!
    await act(async () => {
      fireEvent.click(within(notice).getByRole('button', { name: t('notice.undo') }))
    })
    expect(ta.value).toBe(log)
  })

  it('F2(Q4): ログを置き換えた分の「元に戻す」は、カーソルを末尾に置き、フォーカスしない', async () => {
    const log = HEADER + '1000 ja1xyz'
    const ta = await open(log)
    await menu(t('menu.clear'))
    await act(async () => {
      fireEvent.click(within(noticeOf(t('notice.cleared'))!).getByRole('button', { name: t('notice.undo') }))
    })
    expect(ta.selectionStart).toBe(log.length)
    expect(document.activeElement).not.toBe(ta)
  })

  it('F2: 空白だけのログを置き換えたときは、通知も「元に戻す」も出さない', async () => {
    await open('  \n')
    await menu(t('menu.clear'))
    expect(noticeOf(t('notice.cleared'))).toBeNull()
    expect(localStorage.getItem('fle.log.prev')).toBeNull()
  })

  it('F4: メニューの「元に戻す」は、前の内容が今と違うときだけ出る。押すと前の内容に戻す', async () => {
    const log = HEADER + '1000 ja1xyz'
    const ta = await open(log)
    const sheet = await openMenu()
    expect(sheet.queryByRole('button', { name: t('menu.undo') })).toBeNull()
    await act(async () => {
      fireEvent.click(sheet.getByRole('button', { name: t('menu.clear') }))
    })
    await menu(t('menu.undo'))
    expect(ta.value).toBe(log)
  })
})

describe('G. メニュー', () => {
  it('G1: ログが空なら、場所の変更・山頂の地図は出さず、書き出し・保存は押せない。従来の配置では QSO の一覧を出さない', async () => {
    await open()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('header.menu') }))
    })
    expect(screen.queryByRole('button', { name: t('menu.change') })).toBeNull()
    expect(screen.queryByRole('button', { name: t('menu.map') })).toBeNull()
    expect(screen.getByRole('button', { name: t('menu.export') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('menu.saveFle') })).toBeDisabled()
    expect(screen.queryByRole('button', { name: t('menu.list') })).toBeNull()
  })

  it('G1: ログに文字があれば、場所の変更・山頂の地図を出し、書き出し・保存を押せる', async () => {
    await open(HEADER)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('header.menu') }))
    })
    expect(screen.getByRole('button', { name: t('menu.change') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('menu.map') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('menu.export') })).toBeEnabled()
    expect(screen.getByRole('button', { name: t('menu.saveFle') })).toBeEnabled()
  })

  it('G10: 使い方は、英語なら英語の説明書を開く', async () => {
    await open('', { language: 'en' })
    const en = translator('en')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: en('header.menu') }))
    })
    expect(screen.getByRole('link', { name: en('menu.help') })).toHaveAttribute('href', expect.stringMatching(/manual\/en\/$/))
  })

  it('G11: サンプルは、UTC での今日の日付の見本でログを置き換え、通知に「元に戻す」を添える', async () => {
    // 日本時間では 10/28 の朝。見本は timezone +0 なので、UTC の 10/27
    at('2026-10-27T22:00:00Z')
    const ta = await open(HEADER)
    await menu(t('menu.sample'))
    await waitFor(() => expect(ta.value).toContain('date 2026-10-27'))
    expect(ta.value).toContain('timezone +0')
    expect(noticeOf(t('notice.sampleInserted'))).not.toBeNull()
  })
})

describe('H. 書き出し', () => {
  /** ダウンロードした名前(なければ空) */
  function captureDownloads() {
    const names: string[] = []
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download)
    })
    return names
  }

  it('H1・H4: 日付・自局・運用場所があれば、グリッドがなくても止めずに zip をダウンロードする', async () => {
    const names = captureDownloads()
    await open(HEADER + '1000 ja1xyz')
    await menu(t('menu.export'))
    await waitFor(() => expect(names).toHaveLength(1))
    expect(names[0]).toMatch(/\.zip$/)
    expect(screen.queryByText(t('check.title'))).toBeNull()
  })

  it('H1: 日付がなければ、確認のシートを開く(生成しない)', async () => {
    const names = captureDownloads()
    await open('mycall JA1ABC\nmysota JA/TK-001\n40m cw\n1000 ja1xyz')
    await menu(t('menu.export'))
    await screen.findByText(t('check.title'))
    expect(names).toHaveLength(0)
  })

  it('H1・H3(Q2): 運用場所がなければ、確認のシートを開き、運用場所のボタンを出す', async () => {
    const names = captureDownloads()
    await open('mycall JA1ABC\ndate 2026-10-27\n40m cw\n1000 ja1xyz')
    await menu(t('menu.export'))
    await screen.findByRole('button', { name: t('check.setPlace') })
    expect(names).toHaveLength(0)
  })

  it('H2(Q8): ログの途中に date があれば、その行を写して、最初の QSO の前に書く', async () => {
    const names = captureDownloads()
    at('2026-10-28T03:00:00Z')
    const log = 'mycall JA1ABC\nmysota JA/TK-001\n40m cw\n0900 ja1aaa\ndate 10/25\n1000 ja1bbb'
    const ta = await open(log)
    await menu(t('menu.export'))
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: t('check.write') }))
    })
    await waitFor(() => expect(names).toHaveLength(1))
    expect(ta.value).toBe('mycall JA1ABC\nmysota JA/TK-001\n40m cw\ndate 10/25\n0900 ja1aaa\ndate 10/25\n1000 ja1bbb')
  })

  it('H2(Q3): 書き込んで生成で足す日付は、最初の QSO の前に、ログのタイムゾーンでの今日', async () => {
    const names = captureDownloads()
    // UTC では 10/27 の夜、JST では 10/28 の朝
    at('2026-10-27T22:00:00Z')
    const log = 'timezone +9\nmycall JA1ABC\nmysota JA/TK-001\n40m cw\n0700 ja1xyz'
    const ta = await open(log, { timezone: 9 })
    await moveTo(ta, log.length)
    await menu(t('menu.export'))
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: t('check.write') }))
    })
    await waitFor(() => expect(names).toHaveLength(1))
    expect(ta.value).toBe('timezone +9\nmycall JA1ABC\nmysota JA/TK-001\n40m cw\ndate 2026-10-28\n0700 ja1xyz')
    // カーソルは同じ文字の上(末尾)
    expect(ta.selectionStart).toBe(ta.value.length)
  })

  it('H5: 誤りのあるログでも生成し、誤りがあったことを通知する', async () => {
    const names = captureDownloads()
    await open(HEADER + '1000 ja1xyz\n9999 ja2xyz')
    await menu(t('menu.export'))
    await waitFor(() => expect(names).toHaveLength(1))
    expect(noticeOf(t('notice.errorsFile'))).not.toBeNull()
  })

  it('H6: FLE ログを保存は、.txt でダウンロードする', async () => {
    const names = captureDownloads()
    await open(HEADER + '1000 ja1xyz')
    await menu(t('menu.saveFle'))
    await waitFor(() => expect(names).toHaveLength(1))
    expect(names[0]).toMatch(/\.txt$/)
  })
})

describe('I. 読み込み', () => {
  const fileInput = (accept: string) => document.querySelector(`input[type=file][accept="${accept}"]`) as HTMLInputElement

  async function choose(input: HTMLInputElement, name: string, content: string) {
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([content], name)] } })
    })
  }

  it('I1: FLE ログを開くと、ログを置き換え、通知に「元に戻す」を添える', async () => {
    const before = HEADER + '1000 ja1xyz'
    const ta = await open(before)
    await choose(fileInput('.txt,.fle'), 'log.txt', 'mycall JA9ZZZ\n')
    await waitFor(() => expect(ta.value).toBe('mycall JA9ZZZ\n'))
    expect(localStorage.getItem('fle.log.prev')).toBe(before)
    expect(noticeOf(t('notice.loaded'))).not.toBeNull()
  })

  const ADIF = '<CALL:6>JA1XYZ<QSO_DATE:8>20261027<TIME_ON:4>1000<BAND:3>40m<MODE:2>CW<EOR>\n'

  it('I2: ADIF を追加すると、末尾に timezone utc から始まる行を足し、後ろに元のログの時間帯を戻す', async () => {
    const before = 'timezone +9\n' + HEADER + '1900 ja2xyz'
    const ta = await open(before, { timezone: 9 })
    await choose(fileInput('.adi,.adif'), 'log.adi', ADIF)
    await waitFor(() => expect(ta.value).not.toBe(before))
    expect(ta.value.startsWith(before + '\ntimezone utc\n')).toBe(true)
    expect(ta.value.endsWith('timezone +9\n')).toBe(true)
    expect(ta.value).toMatch(/ja1xyz/i)
  })

  it('I2(Q7): 空のログに足したときは、通知を出さない(戻す先がない。取り込んだ行が知らせになる)', async () => {
    const ta = await open('')
    await choose(fileInput('.adi,.adif'), 'log.adi', ADIF)
    await waitFor(() => expect(ta.value).toMatch(/ja1xyz/i))
    expect(noticeOf(t('notice.adifAdded'))).toBeNull()
    expect(localStorage.getItem('fle.log.prev')).toBeNull()
  })

  it('I2(Q1): ADIF の取り込みは、通知の「元に戻す」で取り込む前に戻せる', async () => {
    const before = HEADER + '1000 ja2xyz'
    const ta = await open(before)
    await choose(fileInput('.adi,.adif'), 'log.adi', ADIF)
    await waitFor(() => expect(ta.value).not.toBe(before))
    expect(localStorage.getItem('fle.log.prev')).toBe(before)
    const notice = noticeOf(t('notice.adifAdded'))!
    await act(async () => {
      fireEvent.click(within(notice).getByRole('button', { name: t('notice.undo') }))
    })
    expect(ta.value).toBe(before)
  })

  it('I2: 取り込む QSO のない ADIF では、ログも「前の内容」も変えず、通知しない', async () => {
    const before = HEADER + '1000 ja2xyz'
    const ta = await open(before)
    await choose(fileInput('.adi,.adif'), 'empty.adi', 'ADIF export\n<EOH>\n')
    await act(async () => {})
    expect(ta.value).toBe(before)
    expect(localStorage.getItem('fle.log.prev')).toBeNull()
    expect(noticeOf(t('notice.adifAdded'))).toBeNull()
  })

  it('I4: ファイルを選んだら、選択を空に戻す', async () => {
    await open()
    const input = fileInput('.txt,.fle')
    await choose(input, 'log.txt', 'mycall JA9ZZZ\n')
    expect(input.value).toBe('')
  })
})

describe('K. 表示と配置', () => {
  /** タッチ端末にする(フルキー) */
  const touch = () => media(true)

  it('K1: PC は従来の配置(OS のキーボードを使う)', async () => {
    const ta = await open()
    expect(ta).not.toHaveAttribute('inputmode')
    expect(screen.queryByRole('button', { name: t('keys.os') })).toBeNull()
  })

  it('K1・K2: タッチ端末はフルキー。OS のキーボードを出さず、🌐 で切り替え、「フルキーに戻る」で戻す', async () => {
    touch()
    const ta = await open()
    expect(ta).toHaveAttribute('inputmode', 'none')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('keys.os') }))
    })
    expect(ta).not.toHaveAttribute('inputmode')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('keys.back') }))
    })
    expect(ta).toHaveAttribute('inputmode', 'none')
  })

  it('G1: フルキーでは、メニューに QSO の一覧を出す', async () => {
    touch()
    await open()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('header.menu') }))
    })
    expect(screen.getByRole('button', { name: t('menu.list') })).toBeInTheDocument()
  })
})

describe('A. 起動と保存(続き)', () => {
  afterEach(() => history.replaceState(null, '', '/'))

  it('A4: URL のハッシュに同期コードがあれば、参加を確かめるシートを開く。閉じると、ハッシュを消す', async () => {
    history.replaceState(null, '', '/fle/?x=1#sync=' + 'A'.repeat(26))
    await open()
    const sheet = within(screen.getByRole('dialog', { name: t('sync.joinTitle') }))
    await act(async () => {
      fireEvent.click(sheet.getByRole('button', { name: t('sheet.close') }))
    })
    expect(screen.queryByRole('dialog', { name: t('sync.joinTitle') })).toBeNull()
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('?x=1')
  })

  it('A4: 同期コードでないハッシュでは、開かない', async () => {
    history.replaceState(null, '', '/fle/#sync=nope')
    await open()
    expect(screen.queryByRole('dialog', { name: t('sync.joinTitle') })).toBeNull()
  })

  it('A6: ログの解釈に失敗したら、その誤りを通知する', async () => {
    hooks.failCompile = true
    await open(HEADER)
    await waitFor(() => expect(noticeOf('compile broke')).not.toBeNull())
  })
})

describe('B. 画面のキー', () => {
  it('B4: 数字の行のキーは、カーソルの位置に入れ、カーソルを入れた文字の後ろに置く', async () => {
    const ta = await open('ja1xyz', { digitRow: true })
    await moveTo(ta, 3)
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: t('digits.label') })).getByRole('button', { name: '7' }))
    })
    expect(ta.value).toBe('ja17xyz')
    expect(ta.selectionStart).toBe(4)
  })

  it('B4: 選択があれば、その範囲を置き換える', async () => {
    const ta = await open('ja1xyz', { digitRow: true })
    await act(async () => {
      ta.setSelectionRange(3, 6)
      fireEvent.select(ta)
    })
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: t('digits.label') })).getByRole('button', { name: '9' }))
    })
    expect(ta.value).toBe('ja19')
  })

  describe('フルキー', () => {
    beforeEach(() => media(true))
    const key = (name: string) => within(screen.getByRole('group', { name: t('keys.label') })).getByRole('button', { name })

    it('B5: 同じキーを続けて 2 回押すと、1 回目に打った文字を置き換える(- - → ,)', async () => {
      const ta = await open('ja1abc 599')
      // 押すたびに描画される(実際の端末と同じ)
      await act(async () => {
        fireEvent.click(key('-'))
      })
      await act(async () => {
        fireEvent.click(key('-'))
      })
      expect(ta.value).toBe('ja1abc 599,')
    })

    it('B6: ⌫ はカーソルの前の 1 文字を消す。絵文字(サロゲートペア)は 2 つで 1 文字', async () => {
      const ta = await open('ab😀')
      await act(async () => {
        fireEvent.click(key(t('digits.backspace')))
      })
      expect(ta.value).toBe('ab')
      await act(async () => {
        fireEvent.click(key(t('digits.backspace')))
      })
      expect(ta.value).toBe('a')
    })

    it('B6: 選択があれば、その範囲を消す。先頭では何もしない', async () => {
      const ta = await open('ja1xyz')
      await act(async () => {
        ta.setSelectionRange(1, 3)
        fireEvent.select(ta)
      })
      await act(async () => {
        fireEvent.click(key(t('digits.backspace')))
      })
      expect(ta.value).toBe('jxyz')
      await moveTo(ta, 0)
      await act(async () => {
        fireEvent.click(key(t('digits.backspace')))
      })
      expect(ta.value).toBe('jxyz')
    })

    it('B7: ← → でカーソルを動かす。選択があれば、動かす向きの端から。先頭・末尾より外へは出ない', async () => {
      const ta = await open('ja1xyz')
      await act(async () => {
        ta.setSelectionRange(2, 4)
        fireEvent.select(ta)
      })
      await act(async () => {
        fireEvent.click(key(t('digits.right')))
      })
      expect([ta.selectionStart, ta.selectionEnd]).toEqual([5, 5])
      await act(async () => {
        ta.setSelectionRange(2, 4)
        fireEvent.select(ta)
      })
      await act(async () => {
        fireEvent.click(key(t('digits.left')))
      })
      expect([ta.selectionStart, ta.selectionEnd]).toEqual([1, 1])
      await act(async () => {
        fireEvent.click(key(t('digits.left')))
        fireEvent.click(key(t('digits.left')))
      })
      expect(ta.selectionStart).toBe(0)
      await moveTo(ta, 6)
      await act(async () => {
        fireEvent.click(key(t('digits.right')))
      })
      expect(ta.selectionStart).toBe(6)
    })
  })
})

describe('C. OK(続き)', () => {
  it('C5: OK を押す前から、確定したらどう見えるか(いまの時刻)を候補バーに出す', async () => {
    at('2026-10-27T10:00:00Z')
    const ta = await open(HEADER + '0900 ja1aaa')
    await type(ta, HEADER + '0900 ja1aaa\nja1xyz')
    await waitFor(() => expect(screen.getByRole('button', { name: t('bar.selectTime') })).toHaveTextContent('10:00'))
    // 打ち直したら、前の姿は出さない(新しい入力の姿になる)
    vi.setSystemTime(new Date('2026-10-27T10:07:00Z'))
    await type(ta, HEADER + '0900 ja1aaa\n')
    await type(ta, HEADER + '0900 ja1aaa\nja2xyz')
    await waitFor(() => expect(screen.getByRole('button', { name: t('bar.selectTime') })).toHaveTextContent('10:07'))
  })

  it('C7: OK を押したら、打ち始めの時刻を忘れる(同じ行を直して OK すると、直し始めた時刻)', async () => {
    at('2026-10-27T10:00:00Z')
    const ta = await open(HEADER)
    await type(ta, HEADER + 'ja1xyz')
    await confirm()
    expect(ta.value).toBe(HEADER + '1000 ja1xyz\n')
    // 時刻を消して、10:10 に直し始める
    vi.setSystemTime(new Date('2026-10-27T10:10:00Z'))
    await type(ta, HEADER + 'ja1xyz\n', HEADER.length + 6)
    await confirm()
    expect(ta.value.split('\n')[4]).toBe('1010 ja1xyz')
  })
})

describe('D. 候補バーと補完(続き)', () => {
  const rst = () => screen.getAllByRole('button', { name: t('bar.selectRst') })[0]

  it('D2: RST は、押すたびに受信 → 送信と移る', async () => {
    const line = '1000 ja1xyz 559 579'
    const ta = await open(HEADER + line)
    await waitFor(() => expect(rst()).toBeInTheDocument())
    await act(async () => {
      fireEvent.click(rst())
    })
    const rcvd = HEADER.length + line.length
    expect(ta.selectionStart).toBe(rcvd)
    await act(async () => {
      fireEvent.click(rst())
    })
    expect(ta.selectionStart).toBe(HEADER.length + '1000 ja1xyz 559'.length)
    await act(async () => {
      fireEvent.click(rst())
    })
    expect(ta.selectionStart).toBe(rcvd)
  })

  const strip = () => screen.queryByRole('group', { name: t('suggest.label') }) ?? screen.queryByLabelText(t('suggest.label'))

  it('D3: 補完の候補を選ぶと、補完の始まりからカーソルまでを置き換え、カーソルをその後ろに置く', async () => {
    const ta = await open('')
    await type(ta, 'mys')
    await waitFor(() => expect(strip()).not.toBeNull())
    await act(async () => {
      fireEvent.click(within(strip()!).getByRole('button', { name: /^mysota/ }))
    })
    expect(ta.value).toMatch(/^mysota/)
    expect(ta.selectionStart).toBe(ta.value.length)
  })

  it('D4: rig の値の候補は、設定のリグの一覧から出す', async () => {
    const ta = await open('', { rigs: ['KX2', 'IC-705'] })
    await type(ta, 'rig i')
    await waitFor(() => expect(strip()).not.toBeNull())
    expect(within(strip()!).getAllByRole('button')).toHaveLength(1)
    await act(async () => {
      fireEvent.click(within(strip()!).getByRole('button', { name: /^IC-705/ }))
    })
    expect(ta.value).toBe('rig IC-705 ')
  })

  it('D5: 補完の候補は、従来の配置ではログ欄の下端、フルキーでは候補バーに重ねて出す', async () => {
    const ta = await open('')
    await type(ta, 'mys')
    await waitFor(() => expect(strip()).not.toBeNull())
    expect(strip()!.parentElement).toContainElement(ta)
    cleanup()
    media(true)
    const ta2 = await open('')
    await type(ta2, 'mys')
    await waitFor(() => expect(strip()).not.toBeNull())
    expect(strip()!.parentElement).not.toContainElement(ta2)
  })
})

describe('E. 取り消し(続き)', () => {
  const undoKey = async (ta: HTMLTextAreaElement) => {
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'z', ctrlKey: true })
    })
  }

  it('E4: 取り消した操作は、記録に積まない(続けて取り消すと、さらに前へ戻る)', async () => {
    const ta = await open('')
    await type(ta, 'a')
    await type(ta, 'a\n')
    await type(ta, 'a\nb')
    await undoKey(ta)
    expect(ta.value).toBe('a\n')
    await undoKey(ta)
    expect(ta.value).toBe('')
    // 記録が尽きたら、何もしない
    await undoKey(ta)
    expect(ta.value).toBe('')
  })

  it('E5: 記録は最新の 100 まで', async () => {
    const ta = await open('000')
    // 1 文字の置き換え(長さが変わらない編集)は、毎回まとまりが分かれる
    for (let i = 1; i <= 105; i++) await type(ta, String(i).padStart(3, '0'))
    for (let i = 0; i < 105; i++) await undoKey(ta)
    expect(ta.value).toBe('005')
  })
})

describe('F. 通知の長さ', () => {
  it('F3: 通知は 4 秒で消える。「元に戻す」を添えた通知は 8 秒', async () => {
    const ta = await open(HEADER + '1000 ja1xyz')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await menu(t('menu.clear'))
    expect(ta.value).toBe('')
    await act(async () => {
      vi.advanceTimersByTime(7900)
    })
    expect(noticeOf(t('notice.cleared'))).not.toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(noticeOf(t('notice.cleared'))).toBeNull()

    // 「元に戻す」のない通知(自動保存の失敗)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    await type(ta, 'x')
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(noticeOf(t('notice.autosaveFailed'))).not.toBeNull()
    // 保存は打って 0.4 秒後なので、通知が出たのは 0.4 秒の時点。4.4 秒で消える
    await act(async () => {
      vi.advanceTimersByTime(3800)
    })
    expect(noticeOf(t('notice.autosaveFailed'))).not.toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(noticeOf(t('notice.autosaveFailed'))).toBeNull()
  })
})

describe('G. 場所のシート', () => {
  const sheet = (title: string) => within(screen.getByRole('dialog', { name: title }))
  /** 開いている場所のシート(見出しは、カーソル行より前に QSO があるかで変わる) */
  const placeSheet = () => within(document.querySelector('dialog[open]') as HTMLElement)
  const field = (s: ReturnType<typeof sheet>, id: string) => s.getByLabelText(id) as HTMLInputElement

  async function write(s: ReturnType<typeof sheet>) {
    await act(async () => {
      fireEvent.click(s.getByRole('button', { name: t('place.write') }))
    })
    await act(async () => {})
  }

  it('G2・G7: 新しいログは、自局を前回のコールサイン、場所を空にして開く。書き込むとログを置き換え、自局を覚える', async () => {
    localStorage.setItem('fle.mycall', 'JA1ABC')
    const before = HEADER + '1000 ja1xyz'
    const ta = await open(before)
    await menu(t('menu.place'))
    const s = sheet(t('place.newLog'))
    expect(field(s, t('place.mycall')).value).toBe('JA1ABC')
    expect(field(s, 'SOTA').value).toBe('')
    fireEvent.change(field(s, t('place.mycall')), { target: { value: 'JA9ZZZ' } })
    fireEvent.change(field(s, 'SOTA'), { target: { value: 'JA/NN-001' } })
    await write(s)
    await waitFor(() => expect(ta.value).toMatch(/mysota JA\/NN-001/i))
    expect(ta.value).not.toContain('ja1xyz')
    expect(ta.value).toMatch(/mycall JA9ZZZ/i)
    expect(localStorage.getItem('fle.mycall')).toBe('JA9ZZZ')
    expect(localStorage.getItem('fle.log.prev')).toBe(before)
    expect(noticeOf(t('notice.newLog'))).not.toBeNull()
    expect(ta.selectionStart).toBe(ta.value.length)
    expect(document.activeElement).toBe(ta)
  })

  it('G3: 場所の変更は、カーソル行で有効な自局と場所で開き、カーソル行の前に指令の行を入れる', async () => {
    const log = HEADER + '1000 ja1xyz\n1010 ja2xyz'
    const ta = await open(log)
    const at3 = log.length - 3
    await moveTo(ta, at3)
    await menu(t('menu.change'))
    const s = placeSheet()
    expect(field(s, t('place.mycall')).value).toBe('JA1ABC')
    expect(field(s, 'SOTA').value).toBe('JA/TK-001')
    fireEvent.change(field(s, 'SOTA'), { target: { value: 'JA/TK-002' } })
    await write(s)
    await waitFor(() => expect(ta.value).not.toBe(log))
    const lines = ta.value.split('\n')
    expect(lines.indexOf('1010 ja2xyz') - 1).toBe(lines.findIndex((l) => /mysota JA\/TK-002/i.test(l)))
    // カーソルは同じ文字の上
    expect(ta.value.slice(ta.selectionStart - 4, ta.selectionStart + 3)).toBe('1010 ja2xyz'.slice(4, 11))
  })

  it('G3: カーソル行より前に QSO がなければ、新しいログの見出しで開く', async () => {
    const ta = await open(HEADER + '1000 ja1xyz')
    await moveTo(ta, 3)
    await menu(t('menu.change'))
    expect(screen.getByRole('dialog', { name: t('place.setup') })).toBeInTheDocument()
  })

  it('G4: 誤りがあれば、シートを閉じずに欄に出す', async () => {
    const ta = await open(HEADER + '1000 ja1xyz')
    await menu(t('menu.change'))
    const s = placeSheet()
    fireEvent.change(field(s, t('place.mycall')), { target: { value: 'NOT A CALL' } })
    await write(s)
    expect(s.getByRole('alert')).toBeInTheDocument()
    expect(ta.value).toBe(HEADER + '1000 ja1xyz')
  })

  it('G5: メモを書けば、# の行にする。その位置で有効なメモと同じなら書かない', async () => {
    const log = HEADER + '# JCC#1001\n1000 ja1xyz'
    const ta = await open(log)
    await menu(t('menu.change'))
    let s = placeSheet()
    // 同じメモ(開いたときの初期値)のまま、場所だけ変える
    expect(field(s, t('place.memo')).value).toBe('JCC#1001')
    fireEvent.change(field(s, 'SOTA'), { target: { value: 'JA/TK-002' } })
    await write(s)
    await waitFor(() => expect(ta.value).toMatch(/TK-002/))
    expect(ta.value.match(/# JCC#1001/g)).toHaveLength(1)

    await moveTo(ta, ta.value.length)
    await menu(t('menu.change'))
    s = placeSheet()
    fireEvent.change(field(s, t('place.memo')), { target: { value: 'JCC#1002' } })
    await write(s)
    await waitFor(() => expect(ta.value).toContain('# JCC#1002'))
  })

  it('G5: メモの欄が空で触っていなければ、引けないとき(オフライン)は書かない', async () => {
    const ta = await open('')
    await menu(t('menu.place'))
    const s = sheet(t('place.newLog'))
    fireEvent.change(field(s, t('place.mycall')), { target: { value: 'JA1ABC' } })
    fireEvent.change(field(s, 'SOTA'), { target: { value: 'JA/TK-001' } })
    await write(s)
    await waitFor(() => expect(ta.value).toMatch(/mysota/i))
    expect(ta.value).not.toContain('#')
  })

  it('G6: 新しいログで書いた周波数・モードは、指令の行のあと(最初の QSO の前)に書く', async () => {
    const ta = await open('')
    await menu(t('menu.place'))
    const s = sheet(t('place.newLog'))
    fireEvent.change(field(s, t('place.mycall')), { target: { value: 'JA1ABC' } })
    fireEvent.change(field(s, 'SOTA'), { target: { value: 'JA/TK-001' } })
    fireEvent.change(field(s, t('place.freq')), { target: { value: '40m' } })
    fireEvent.change(field(s, t('place.mode')), { target: { value: 'cw' } })
    await write(s)
    await waitFor(() => expect(ta.value).toMatch(/mysota/i))
    const lines = ta.value.trimEnd().split('\n')
    expect(lines[lines.length - 1]).toMatch(/^40m cw$/i)
  })

  it('G12: 予定を選んで書き込むと、予定の日付・リグ・QSL メッセージも指令の行にする。ログに同じ行があれば書かない', async () => {
    const plan = {
      id: 'p1',
      title: '高尾山',
      date: '2026-10-25',
      mycall: 'JA1ABC',
      sota: 'JA/TK-001',
      pota: [],
      wwff: '',
      grid: '',
      rig: 'KX2',
      qslmsg: 'TNX $mysota',
      updatedAt: 1,
    }
    localStorage.setItem('fle.plans', JSON.stringify([plan]))
    const ta = await open('rig KX2\n')
    await menu(t('menu.place'))
    const s = placeSheet()
    await act(async () => {
      fireEvent.click(within(s.getByRole('region', { name: t('plans.use') })).getByRole('button', { name: /高尾山/ }))
    })
    await write(s)
    await waitFor(() => expect(ta.value).toMatch(/mysota JA\/TK-001/i))
    const lines = ta.value.split('\n')
    expect(lines).toContain('date 2026-10-25')
    expect(lines).toContain('qslmsg TNX $mysota')
    // 新しいログは空のログに書くので、置き換える前のログの rig の行は数えない(予定の rig を 1 行書く)
    expect(lines.filter((l) => l === 'rig KX2')).toHaveLength(1)
  })

  it('G12: 場所の変更で予定を選んだとき、ログにすでにある同じ行は書かない', async () => {
    const plan = {
      id: 'p1',
      title: '高尾山',
      date: '2026-10-27',
      mycall: 'JA1ABC',
      sota: 'JA/TK-002',
      pota: [],
      wwff: '',
      grid: '',
      rig: 'KX2',
      qslmsg: '',
      updatedAt: 1,
    }
    localStorage.setItem('fle.plans', JSON.stringify([plan]))
    const log = HEADER + 'rig KX2\n1000 ja1xyz\n1010 ja2xyz'
    const ta = await open(log)
    await moveTo(ta, log.length)
    await menu(t('menu.change'))
    const s = placeSheet()
    await act(async () => {
      fireEvent.click(within(s.getByRole('region', { name: t('plans.use') })).getByRole('button', { name: /高尾山/ }))
    })
    await write(s)
    await waitFor(() => expect(ta.value).toMatch(/TK-002/))
    const lines = ta.value.split('\n')
    // HEADER の date 2026-10-27 と rig KX2 は、もうあるので足さない
    expect(lines.filter((l) => l === 'date 2026-10-27')).toHaveLength(1)
    expect(lines.filter((l) => l === 'rig KX2')).toHaveLength(1)
  })

  it('G8: 山頂の地域の地図を新しく端末に入れたら、通知する', async () => {
    vi.mocked(refreshRegionOf).mockResolvedValue('updated')
    // 山の候補の検索が失敗すると、オフラインとみなす。通信はできる(何も見つからない)ことにする
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('[]', { headers: { 'content-type': 'application/json' } })))
    await open(HEADER + '1000 ja1xyz')
    await menu(t('menu.change'))
    const s = placeSheet()
    fireEvent.change(field(s, 'SOTA'), { target: { value: 'JA/NN-001' } })
    await write(s)
    await waitFor(() => expect(noticeOf(t('notice.mapSaved', { region: 'JA/NN' }))).not.toBeNull())
    expect(refreshRegionOf).toHaveBeenCalledWith('JA/NN-001')
  })

  it('G8: 地図が同じ版なら、通知しない', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('[]', { headers: { 'content-type': 'application/json' } })))
    await open(HEADER + '1000 ja1xyz')
    await menu(t('menu.change'))
    await write(placeSheet())
    await act(async () => {})
    expect(refreshRegionOf).toHaveBeenCalled()
    expect(screen.queryByText(/山頂の地図を端末に保存しました/)).toBeNull()
  })

  it('G9: 山頂の地図は、カーソル位置で有効な mysota の地図を開く', async () => {
    const log = HEADER + '1000 ja1xyz\nmysota JA/TK-002\n1010 ja2xyz'
    const ta = await open(log)
    await moveTo(ta, HEADER.length + 3)
    await menu(t('menu.map'))
    expect(await screen.findByTestId('map-sheet')).toHaveTextContent('JA/TK-001')
  })
})

describe('H. 書き出し(続き)', () => {
  it('H3: 運用場所のボタンは、先頭の行を基準に場所のシートを開く', async () => {
    const ta = await open('mycall JA1ABC\ndate 2026-10-27\n40m cw\n1000 ja1xyz')
    await moveTo(ta, ta.value.length)
    await menu(t('menu.export'))
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: t('check.setPlace') }))
    })
    expect(screen.getByRole('dialog', { name: t('place.setup') })).toBeInTheDocument()
  })
})

describe('J. 設定の時間帯', () => {
  async function setZone(tz: number) {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('header.settings') }))
    })
    await act(async () => {
      fireEvent.change(screen.getByLabelText(t('settings.timezone')), { target: { value: String(tz) } })
    })
    await act(async () => {})
  }
  const savedZone = () => JSON.parse(localStorage.getItem('fle.settings')!).timezone ?? 0

  it('J1・J2: 別の時間帯の QSO があれば、変換するかを聞く。「変換する」は時刻を書き直し、通知に「元に戻す」を添える', async () => {
    const log = HEADER + '1000 ja1xyz'
    const ta = await open(log)
    await setZone(9)
    const ask = within(screen.getByRole('dialog', { name: t('retime.title', { zone: 'JST' }) }))
    // 答えるまでは、設定もログも変えない
    expect(savedZone()).toBe(0)
    await act(async () => {
      fireEvent.click(ask.getByRole('button', { name: t('retime.convert') }))
    })
    await waitFor(() => expect(ta.value).toContain('1900 ja1xyz'))
    expect(ta.value).toMatch(/^timezone/m)
    expect(savedZone()).toBe(9)
    expect(localStorage.getItem('fle.log.prev')).toBe(log)
    expect(noticeOf(t('notice.retimed', { zone: 'JST' }))).not.toBeNull()
  })

  it('J2: 「時刻はそのまま」は、timezone の行だけを書き換える', async () => {
    const ta = await open(HEADER + '1000 ja1xyz')
    await setZone(9)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('retime.keep') }))
    })
    await waitFor(() => expect(ta.value).toMatch(/^timezone/m))
    expect(ta.value).toContain('1000 ja1xyz')
    expect(noticeOf(t('notice.relabeled', { zone: 'JST' }))).not.toBeNull()
  })

  it('J2: やめると、設定もログも変えない', async () => {
    const log = HEADER + '1000 ja1xyz'
    const ta = await open(log)
    await setZone(9)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('retime.cancel') }))
    })
    expect(savedZone()).toBe(0)
    expect(ta.value).toBe(log)
  })

  it('J1: QSO がなく文字があれば、聞かずに timezone の行を書き直す', async () => {
    const ta = await open(HEADER)
    await setZone(9)
    expect(screen.queryByRole('button', { name: t('retime.convert') })).toBeNull()
    await waitFor(() => expect(ta.value).toMatch(/^timezone/m))
    expect(savedZone()).toBe(9)
  })

  it('J1: 空のログは、設定だけを変える', async () => {
    const ta = await open('')
    await setZone(9)
    expect(screen.queryByRole('button', { name: t('retime.convert') })).toBeNull()
    expect(ta.value).toBe('')
    expect(savedZone()).toBe(9)
  })

  it('J3: 同期で届いた設定の変更では、聞かず、ログも変えない', async () => {
    const log = HEADER + '1000 ja1xyz'
    const ta = await open(log)
    await act(async () => {
      hooks.syncUpdate!({ timezone: 9 })
    })
    expect(screen.queryByRole('button', { name: t('retime.convert') })).toBeNull()
    expect(ta.value).toBe(log)
    expect(savedZone()).toBe(9)
  })
})

describe('K. 表示と配置(続き)', () => {
  it('K3: 従来の配置では、設定「数字の行」がオンのときだけ数字の行を出す', async () => {
    await open('', { digitRow: true })
    expect(screen.getByRole('group', { name: t('digits.label') })).toBeInTheDocument()
    cleanup()
    await open('', { digitRow: false })
    expect(screen.queryByRole('group', { name: t('digits.label') })).toBeNull()
  })

  it('K4: フルキーで横向きのスマホなら、縦にしてもらう案内を出す(ログはそのまま)', async () => {
    media(true)
    vi.spyOn(window.screen, 'width', 'get').mockReturnValue(800)
    vi.spyOn(window.screen, 'height', 'get').mockReturnValue(400)
    Object.defineProperty(window.screen, 'orientation', { value: { type: 'landscape-primary', addEventListener() {}, removeEventListener() {} }, configurable: true })
    try {
      const ta = await open(HEADER)
      expect(screen.getByRole('alert')).toHaveTextContent(t('landscape.title'))
      expect(ta.value).toBe(HEADER)
    } finally {
      delete (window.screen as { orientation?: unknown }).orientation
    }
  })

  it('K4: 従来の配置(PC)では、横向きの案内を出さない', async () => {
    await open(HEADER)
    expect(screen.queryByText(t('landscape.title'))).toBeNull()
  })

  it('K5: フルキーで設定「時刻と運用先」がオンなら、ログ欄の上に時刻と運用先を出す', async () => {
    media(true)
    await open(HEADER, { showClock: true })
    expect(screen.getAllByText('JA/TK-001').length).toBeGreaterThan(0)
    cleanup()
    await open(HEADER, { showClock: false })
    expect(screen.queryByText('JA/TK-001')).toBeNull()
  })

  it('K5: 従来の配置では、設定がオンでも出さない', async () => {
    await open(HEADER, { showClock: true })
    expect(screen.queryByText('JA/TK-001')).toBeNull()
  })

  it('K6: フルキーでは、内容が変わるたびに打っている行を下端に寄せる。従来の配置では寄せない', async () => {
    media(true)
    const ta = await open('')
    vi.mocked(alignToBottom).mockClear()
    await type(ta, 'j')
    expect(alignToBottom).toHaveBeenCalledWith(ta)
    cleanup()
    media(false)
    const ta2 = await open('')
    vi.mocked(alignToBottom).mockClear()
    await type(ta2, 'j')
    expect(alignToBottom).not.toHaveBeenCalled()
  })

  it('K7: ログ欄の文字の大きさは、設定の倍率(大 1.2)', async () => {
    const ta = await open('', { fontSize: 'large' })
    expect(ta.parentElement!.style.getPropertyValue('--fle-scale')).toBe('1.2')
  })
})
