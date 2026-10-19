// @vitest-environment jsdom
// 事前に `pnpm wasm` で src/wasm/fle を生成しておくこと。
// 表示に渡すログの解釈は、手で作らずコアに任せる(コアの結果と画面の判定がずれる誤りを捕まえるため)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { compile, initSync, sampleLog } from '@/wasm/fle/fle'
import type { LogView } from '@/lib/fle'
import { CandidateBar } from './CandidateBar'

let sample = ''
let lines: string[] = []
const lineOf = (s: string) => lines.indexOf(s)

beforeAll(() => {
  // jsdom では import.meta.url が file: でないので、場所はこのファイルから求める
  initSync({ module: readFileSync(path.resolve(__dirname, '../wasm/fle/fle_bg.wasm')) })
  sample = sampleLog('2026-10-19')
  lines = sample.split('\n')
})

afterEach(cleanup)

const TYPING = '入力中(確定すると緑になります)'
const CONFIRM = 'この行を確定して次の行へ'

/** `text` を解釈し、`line` 行目にカーソルがあるときの候補バーを出す */
function renderAt(text: string, line: number) {
  const view = compile(text) as LogView
  render(
    <CandidateBar
      view={view}
      preview={null}
      caretLine={line}
      lineText={text.split('\n')[line]}
      timezone={0}
      onOpenList={() => {}}
      onConfirm={() => {}}
    />
  )
}

describe('CandidateBar', () => {
  it.each(['#Header', 'mycall jl1nie/0', 'date 2026-10-19', 'timezone +0', '40m cw', 'rig -', 'day +'])(
    '書き終えた指令・コメントの行(%s)は、入力中にしない',
    (l) => {
      renderAt(sample, lineOf(l))
      expect(screen.queryByText(TYPING)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: CONFIRM })).not.toBeInTheDocument()
    }
  )

  it.each(['0910 ja1', 'date 2026-', 'mycall', '40m c', '{abc'])('途中の行(%s)は、入力中にする', (l) => {
    const text = sample + '\n' + l
    renderAt(text, lines.length)
    expect(screen.getByText(TYPING)).toBeInTheDocument()
    expect(screen.getByText(l)).toBeInTheDocument()
  })

  it('解釈できた QSO の行は、確定できる', () => {
    renderAt(sample, lineOf('2302 ja1qsa'))
    expect(screen.getByRole('button', { name: CONFIRM })).toBeInTheDocument()
    expect(screen.getByText('JA1QSA')).toBeInTheDocument()
    expect(screen.queryByText(TYPING)).not.toBeInTheDocument()
  })

  it('空の行は、入力中にしない', () => {
    renderAt(sample + '\n', lines.length)
    expect(screen.queryByText(TYPING)).not.toBeInTheDocument()
  })
})
