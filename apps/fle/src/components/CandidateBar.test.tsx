// @vitest-environment jsdom
// 事前に `pnpm wasm` で src/wasm/fle を生成しておくこと。
// 表示に渡すログの解釈は、手で作らずコアに任せる(コアの結果と画面の判定がずれる誤りを捕まえるため)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { compile, initSync, lineInfo, sampleLog } from '@/wasm/fle/fle'
import type { LineInfo, LogView } from '@/lib/fle'
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

const CONFIRM = 'この行を確定して次の行へ'

/** `text` を解釈し、`line` 行目にカーソルがあるときの候補バーを出す */
function renderAt(text: string, line: number) {
  const view = compile(text) as LogView
  const info = lineInfo(text, line) as LineInfo
  render(
    <CandidateBar
      view={view}
      preview={null}
      info={info}
      caretLine={line}
      lineText={text.split('\n')[line] ?? ''}
      timezone={0}
      onOpenList={() => {}}
      onConfirm={() => {}}
    />
  )
}

/** 候補バー(QSOの数のボタンの隣)の文字 */
const barText = () => document.querySelector('[aria-live]')?.textContent ?? ''

describe('CandidateBar: 指令の行は、解決した値を出す', () => {
  it.each([
    ['date 2026-10-19', '2026-10-19 (月)'],
    ['day +', '2026-10-20 (火)'],
    // サンプルでは date より前。日付がまだないので、時間帯の名前だけ
    ['timezone +0', 'UTC'],
    // サンプルでは rig より前。$rig は QSO ごとに置き換わるので、そのまま見せる
    ['qslmsg 丸山 $mysota $mypota $rig', '丸山 JA/ST-012 JP-1151 JP-1164 $rig'],
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

describe('CandidateBar: 補うものがない行は、時刻とバンド・モードだけ', () => {
  it.each(['#Header', 'mycall jl1nie/0', 'rig KX2+EFHW', '#Log'])('%s', (l) => {
    renderAt(sample, lineOf(l))
    expect(barText()).toMatch(/^\d\d:\d\dUTC/)
    expect(screen.queryByRole('button', { name: CONFIRM })).not.toBeInTheDocument()
  })

  it('バンド・モードは、直前の QSO ではなく、その行までの指令の値', () => {
    // 直前の QSO は 70cm FM。この行で 17m CW になる
    renderAt(sample, lineOf('17m cw'))
    expect(barText()).toMatch(/17m CW$/)
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
})

describe('CandidateBar: QSO の行と、QSO の数', () => {
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

  it('全部が同じ日なら、数と QSO だけ', () => {
    renderAt('mycall JA1ABC\ndate 2026-10-19\n40m cw\n0900 ja1aaa\n0910 ja1bbb', 4)
    expect(screen.getByRole('button', { name: /QSO一覧を開く/ })).toHaveTextContent(/^2QSO$/)
  })
})
