// @vitest-environment jsdom
// 事前に `pnpm wasm` で src/wasm/fle を生成しておくこと。
// 表示に渡すログの解釈は、手で作らずコアに任せる(コアの結果と画面の判定がずれる誤りを捕まえるため)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { compile, initSync, lineInfo, sampleLog } from '@/wasm/fle/fle'
import type { LineInfo, LogView } from '@/lib/fle'
import type { ReactNode } from 'react'
import { CandidateBar } from './CandidateBar'

let sample = ''
let lines: string[] = []
const lineOf = (s: string) => {
  const i = lines.indexOf(s)
  if (i < 0) throw new Error(`no line: ${s}`)
  return i
}

beforeAll(() => {
  // jsdom では import.meta.url が file: でないので、場所はこのファイルから求める
  initSync({ module: readFileSync(path.resolve(__dirname, '../wasm/fle/fle_bg.wasm')) })
  sample = sampleLog('2026-10-19')
  lines = sample.split('\n')
})

beforeEach(() => {
  // 山・公園の名前は引けない(オフライン)ものとする。名前を確かめるテストだけ、差し替える
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const CONFIRM = 'この行を終えて次の行へ(OK)'

/** `text` を解釈し、`line` 行目にカーソルがあるときの候補バーを出す */
function renderAt(
  text: string,
  line: number,
  count: 'day' | 'total' = 'day',
  autoTime = true,
  onSelectPart: (part: string) => void = () => {},
  timezone = 0,
  compact = false,
  extra: { suggest?: ReactNode; onConfirm?: () => void } = {}
) {
  const view = compile(text) as LogView
  const info = lineInfo(text, line) as LineInfo
  render(
    <CandidateBar
      view={view}
      preview={null}
      info={info}
      caretLine={line}
      lineText={text.split('\n')[line] ?? ''}
      timezone={timezone}
      count={count}
      autoTime={autoTime}
      compact={compact}
      suggest={extra.suggest}
      onOpenList={() => {}}
      onConfirm={extra.onConfirm ?? (() => {})}
      onSelectPart={onSelectPart}
    />
  )
}

/** コンパクトな配置で出す */
const renderCompact = (text: string, line: number, count: 'day' | 'total' = 'day') =>
  renderAt(text, line, count, true, () => {}, 0, true)

/** 候補バー(QSOの数のボタンの隣)の文字 */
const barText = () => document.querySelector('[aria-live]')?.textContent ?? ''

describe('CandidateBar: 指令の行は、解決した値を出す', () => {
  it.each([
    ['date 2026-10-19', '2026-10-19 (月)'],
    ['day +', '2026-10-20 (火)'],
    // サンプルでは date より前。日付がまだないので、時間帯の名前だけ
    ['timezone +0', 'UTC'],
    // サンプルでは rig より前。$rig は QSO ごとに置き換わるので、そのまま見せる
    ['qslmsg $mysota $mypota $rig', 'JA/ST-012 JP-1151 JP-1164 $rig'],
    // rig は、値があればその値、- ならリグなし(どちらも出す)
    ['rig KX2+EFHW', 'KX2+EFHW'],
    ['rig -', 'リグなし'],
  ])('%s → %s', (l, want) => {
    renderAt(sample, lineOf(l))
    expect(barText()).toBe(want)
  })

  it('date のあとの timezone は、日付に時間帯の名前を添える', () => {
    renderAt('mycall JA1ABC\ndate 2026-10-19\ntimezone +9', 2)
    expect(barText()).toBe('2026-10-19 (月) JST')
  })

  it('rig のあとの qslmsg は、その rig で置き換える', () => {
    renderAt('mycall JA1ABC\nrig KX2\nqslmsg TNX $rig', 2)
    expect(barText()).toBe('TNX KX2')
  })

  it('場所は、引けなければ番号だけ。POTA が複数なら並べる', () => {
    renderAt(sample, lineOf('mypota jp-1151 jp-1164'))
    expect(barText()).toBe('JP-1151JP-1164')
  })

  it('場所の名前を引けたら、番号に添える', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(JSON.stringify([{ summitCode: 'JA/ST-012', summitNameJ: '丸山', summitName: 'Maruyama' }]))
      )
    )
    renderAt(sample, lineOf('mysota ja/st-012'))
    expect(await screen.findByText('JA/ST-012 丸山')).toBeInTheDocument()
  })
})

describe('CandidateBar: 自局の指令の行は、その値を出す', () => {
  it('mycall', () => {
    renderAt(sample, lineOf('mycall jl1nie/0'))
    expect(barText()).toBe('JL1NIE/0')
  })

  it('値がまだないときは、時刻とバンド・モード', () => {
    renderAt('mygrid pm95uq\nmygrid -', 1)
    expect(barText()).toMatch(/^\d\d:\d\dUTC/)
  })

  it('読めない値の行は、前の値を出さない', () => {
    renderAt('mycall JA1ABC\nmycall ???', 1)
    // 入力の途中の表示(打った文字)になり、前の値(JA1ABC)は出ない
    expect(barText()).toBe('mycall ???')
  })

  it('mygrid', () => {
    renderAt('mycall JA1ABC\nmygrid pm95uq', 1)
    expect(barText()).toBe('PM95uq')
  })
})

describe('CandidateBar: 補うものがない行は、時刻とバンド・モードだけ', () => {
  it.each(['#Header', '#Log'])('%s', (l) => {
    renderAt(sample, lineOf(l))
    expect(barText()).toMatch(/^\d\d:\d\dUTC/)
    expect(screen.queryByRole('button', { name: CONFIRM })).not.toBeInTheDocument()
  })

  it('バンド・モードは、直前の QSO ではなく、その行までの指令の値', () => {
    // 直前の QSO は 70cm FM。この行で 17m CW になる
    renderAt(sample, lineOf('17m cw'))
    expect(barText()).toMatch(/17m CW$/)
  })

  it('時刻を自動で入れないときは、時計ではなく、次の QSO が引き継ぐ時刻', () => {
    renderAt('mycall JA1ABC\ndate 2026-10-19\n40m cw\n0905 ja1aaa\n', 4, 'day', false)
    expect(barText()).toBe('09:05UTC40m CW')
  })

  it('timezone のないログに QSO があれば、設定が JST でも、時計は実際に入る UTC', () => {
    renderAt('40m cw\n0905 ja1aaa\n', 2, 'day', true, () => {}, 9)
    expect(barText()).toMatch(/^\d\d:\d\dUTC/)
  })

  it('QSO がまだなければ、設定の時間帯(最初の QSO で timezone の行を書く)', () => {
    renderAt('40m cw\n', 1, 'day', true, () => {}, 9)
    expect(barText()).toMatch(/^\d\d:\d\dJST/)
  })

  it('空の行も同じ(説明の文はない)', () => {
    renderAt(sample + '\n', lines.length)
    expect(barText()).toMatch(/^\d\d:\d\dUTC6m AM$/)
  })
})

describe('CandidateBar: 入力の途中(橙)と書き忘れ(赤)', () => {
  it.each(['0910 ja1', 'date 2026-', 'mycall', '40m c', '{abc'])(
    '%s は、打った文字だけ。止まったら足りないもの',
    (l) => {
      vi.useFakeTimers()
      renderAt(sample + '\n' + l, lines.length)
      expect(barText().startsWith(l)).toBe(true)
      expect(screen.queryByText(/確定すると緑/)).not.toBeInTheDocument()
      const before = barText()
      act(() => vi.advanceTimersByTime(1600))
      expect(barText().length).toBeGreaterThan(before.length)
    }
  )

  it('バンド・モードの書き忘れは、打った文字と一緒に、すぐ出す', () => {
    renderAt('mycall JA1ABC\ndate 2026-10-19\n0910 ja1xyz', 2)
    expect(barText()).toContain('0910 ja1xyz')
    expect(barText()).toContain('⚠ バンドか周波数を書いてください')
  })

  // QSO として読めても、誤りのある行(コールが2つ・時刻が正しくない)は、緑にせず、止まったら誤りを出す
  it.each([
    ['10 ja1abc ja1xyz', '1行に書けるコールサインは1つです'],
    ['2500 ja1abc', '時刻が正しくありません'],
  ])('%s は、QSO として読めても、誤りを出す', (l, message) => {
    vi.useFakeTimers()
    const text = 'mycall JA1ABC\ndate 2026-10-19\n40m cw\n0900 ja1qso\n' + l
    expect((compile(text) as LogView).qsos.some((q) => q.line === 4)).toBe(true)
    renderAt(text, 4)
    expect(barText().startsWith(l)).toBe(true)
    act(() => vi.advanceTimersByTime(1600))
    expect(barText()).toContain(message)
  })
})

describe('CandidateBar: QSO の行と、QSO の数', () => {
  it('相手のグリッドも出す', () => {
    renderAt(sample, lineOf('58 jk2qsu pm85rl'))
    expect(screen.getByRole('button', { name: CONFIRM }).parentElement).toHaveTextContent('PM85rl')
  })

  it('コール・RST・時刻を押すと、その要素を知らせる(RST の受信・送信は、呼ぶ側が決める)', () => {
    const picked: string[] = []
    renderAt(sample, lineOf('2302 ja1qsa'), 'day', true, (p) => picked.push(p))
    act(() => screen.getByRole('button', { name: 'コールを直す(末尾へ)' }).click())
    act(() => screen.getByRole('button', { name: '時刻を直す(末尾へ)' }).click())
    const rst = screen.getByRole('button', { name: /RSTを直す/ })
    act(() => rst.click())
    expect(picked).toEqual(['call', 'time', 'rst'])
  })

  it('2段目は RST が先頭で、時刻はその後ろ', () => {
    renderAt(sample, lineOf('2302 ja1qsa'))
    const rst = screen.getByRole('button', { name: /RSTを直す/ })
    expect(rst).toHaveTextContent('599/599')
    expect(rst.nextElementSibling).toHaveAccessibleName('時刻を直す(末尾へ)')
  })

  it('解釈できた QSO の行は、確定できる', () => {
    renderAt(sample, lineOf('2302 ja1qsa'))
    expect(screen.getByRole('button', { name: CONFIRM })).toBeInTheDocument()
    expect(screen.getByText('JA1QSA')).toBeInTheDocument()
  })

  it('カーソルの日(UTC)の数を大きく、全体の数を小さく出す', () => {
    // day + のあとの QSO は 3 つ(zl1qsb, zl1qrz, jj1qth)。全体は 10
    renderAt(sample, lines.length - 1)
    const count = screen.getByRole('button', { name: /QSO一覧を開く/ })
    expect(count).toHaveTextContent('3/10')
    expect(count).toHaveAccessibleName('QSO一覧を開く (カーソルの日(UTC)の 3 QSO / 全部で 10 QSO)')
  })

  it('全部が同じ日でも、その日 / 全体の形', () => {
    renderAt('mycall JA1ABC\ndate 2026-10-19\n40m cw\n0900 ja1aaa\n0910 ja1bbb', 4)
    expect(screen.getByRole('button', { name: /QSO一覧を開く/ })).toHaveTextContent(/^2\/2$/)
  })

  it('設定で「全体」にすると、全体の数と QSO だけ', () => {
    renderAt(sample, lines.length - 1, 'total')
    const count = screen.getByRole('button', { name: 'QSO一覧を開く' })
    expect(count).toHaveTextContent(/^10QSO$/)
  })
})

describe('CandidateBar: コンパクトな配置の QSO の数', () => {
  it('POTA の運用では、カーソルの日(UTC)の数を大きく、アクティベーション成立に必要な数(10)を小さく出す', () => {
    renderCompact(sample, lines.length - 1)
    const count = screen.getByLabelText(/カーソルの日/)
    expect(count).toHaveTextContent(/^3\/10$/)
    expect(count).toHaveAccessibleName('カーソルの日(UTC)の 3 QSO / 全部で 10 QSO / アクティベーション成立(10 QSO)まで、あと 7')
  })

  it('数は表示だけ(押せない。一覧はメニューから)で、バーの左端に出す', () => {
    renderCompact(sample, lines.length - 1)
    const count = screen.getByRole('img', { name: /カーソルの日/ })
    expect(count.closest('button')).toBeNull()
    expect(screen.queryByRole('button', { name: /QSO一覧を開く/ })).not.toBeInTheDocument()
    expect(count.parentElement?.firstElementChild).toBe(count)
  })

  it('運用場所がなければ、その日 / 全体の形', () => {
    renderCompact('mycall JA1ABC\ndate 2026-10-19\n40m cw\n0900 ja1aaa\n0910 ja1bbb', 4)
    expect(screen.getByLabelText(/カーソルの日/)).toHaveTextContent(/^2\/2$/)
  })

  it('SOTA は 4 QSO で、アクティベーション成立を知らせる', () => {
    const log = 'mycall JA1ABC\nmysota JA/ST-012\ndate 2026-10-19\n40m cw\n0900 ja1aaa\n0910 ja1bbb\n0920 ja1ccc'
    renderCompact(log, 6)
    expect(screen.getByLabelText(/カーソルの日/)).toHaveTextContent(/^3\/4$/)
    cleanup()
    renderCompact(`${log}\n0930 ja1ddd`, 7)
    const count = screen.getByLabelText(/カーソルの日/)
    expect(count).toHaveTextContent(/^4\/4$/)
    expect(count).toHaveAccessibleName(/アクティベーション成立\(4 QSO\)$/)
  })

  it('設定で「全体」にすると、全体の数と QSO だけ', () => {
    renderCompact(sample, lines.length - 1, 'total')
    expect(screen.getByLabelText('全部で 10 QSO')).toHaveTextContent(/^10QSO$/)
  })
})

describe('CandidateBar: フルキーの緑のバー', () => {
  const log = 'mycall JA1ABC\ndate 2026-10-19\n40m cw\n1011 7m1abc/1 jaff-0001 pm95 {山田さん}'

  it('2段目のリファレンス・グリッド・備考は、1つの要素で1行に収め、入らなければ … で省く(要素ごとに折り返さない)', () => {
    renderAt(log, 3, 'day', true, () => {}, 0, true)
    const extras = screen.getByText(/JAFF-0001 PM95/)
    expect(extras).toHaveClass('truncate')
    expect(extras).toHaveTextContent('JAFF-0001 PM95山田さん')
  })

  it('コールは左、RST は右端に寄せ、どちらも大きな文字', () => {
    renderAt(log, 3, 'day', true, () => {}, 0, true)
    const call = screen.getByRole('button', { name: /コールを直す/ })
    const rst = screen.getByRole('button', { name: /RSTを直す/ })
    expect(call.parentElement).toHaveClass('justify-between')
    expect(call).toHaveClass('text-2xl')
    expect(rst).toHaveClass('text-2xl')
  })
})

describe('CandidateBar: 右端の ✓', () => {
  const log = 'mycall JA1ABC\ndate 2026-10-19\n40m cw\n0900 ja1aaa'
  const suggest = <button type="button">ssb</button>

  it('フルキーでは、緑の行の右端に ✓ OK。補完候補が出ていても押せる(候補はバーに重ね、✓ OK には重ねない)', () => {
    const onConfirm = vi.fn()
    renderAt(log, 3, 'day', true, () => {}, 0, true, { suggest, onConfirm })
    expect(screen.getByText('JA1AAA')).toBeInTheDocument()
    const ok = screen.getByRole('button', { name: CONFIRM })
    expect(ok).toBeEnabled()
    const overlay = screen.getByRole('button', { name: 'ssb' }).parentElement
    expect(overlay).toHaveClass('inset-0')
    expect(overlay?.parentElement).not.toContainElement(ok)
    fireEvent.click(ok)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['QSO でない行(40m cw)', 2],
    ['入力の途中の行', 4],
  ])('フルキーでは、%sでも ✓ OK を同じ場所に出し、押せなくする', (_, line) => {
    renderAt(log + '\n0910 ja', line, 'day', true, () => {}, 0, true, { suggest })
    expect(screen.getByRole('button', { name: CONFIRM })).toBeDisabled()
  })

  it('従来の配置では、緑の行の右端に ✓ を出す', () => {
    renderAt(log, 3)
    expect(screen.getByRole('button', { name: CONFIRM })).toBeInTheDocument()
  })
})
