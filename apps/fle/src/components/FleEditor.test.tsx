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
import { FleEditor } from './FleEditor'

vi.mock('@/hooks/usePwa', () => ({
  usePwa: () => ({ canInstall: false, showIosHint: false, install: () => {} }),
}))
vi.mock('@/hooks/usePlanMaps', () => ({
  usePlanMaps: () => ({ statusOf: () => null }),
}))

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
