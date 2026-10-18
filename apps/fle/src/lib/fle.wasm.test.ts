// @vitest-environment node
// 事前に `pnpm wasm` で src/wasm/fle を生成しておくこと。
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { initSync, compile, complete, fill, generateZip } from '../wasm/fle/fle'

const SAMPLE = 'mycall JA1ABC\ndate 2024-01-15\nmysota JA/TK-001\n40m cw\n0900 JA1XYZ 599 599\n'

beforeAll(() => {
  initSync({ module: readFileSync(new URL('../wasm/fle/fle_bg.wasm', import.meta.url)) })
})

describe('fle wasm', () => {
  it('compile: 正常なログを行番号つきで返す', () => {
    const view = compile(SAMPLE)
    expect(view.status).toBe('OK')
    expect(view.mycall).toBe('JA1ABC')
    expect(view.qsos[0]).toMatchObject({ line: 4, call: 'JA1XYZ', time: '09:00', band: '40m', mode: 'CW' })
  })

  it('compile: 省略された項目は前の行から補完される', () => {
    const view = compile(SAMPLE + '05 JA1QSO\n')
    const last = view.qsos[view.qsos.length - 1]
    expect(last).toMatchObject({ call: 'JA1QSO', time: '09:05', band: '40m', mode: 'CW' })
  })

  it('compile: 誤りがあるとERRと行番号を返す', () => {
    const view = compile('mycall\n')
    expect(view.status).toBe('ERR')
    expect(view.errors).toEqual([{ line: 0, message: 'Missing operand.' }])
  })

  it('complete: 行頭の語からキーワードを返す', () => {
    expect(complete('mys')).toEqual([{ text: 'mysota', kind: 'command' }])
    expect(complete('day ')).toEqual([
      { text: '+', kind: 'day' },
      { text: '++', kind: 'day' },
    ])
  })

  it('complete: 自由入力の位置では何も返さない', () => {
    expect(complete('0905 ja')).toEqual([])
  })

  it('fill: 時刻のない行の行頭に、いまの時刻(UTC)を入れる修正を返す', () => {
    const now = Date.UTC(2026, 9, 18, 9, 5, 30)
    expect(fill('mycall JA1ABC\nja1xyz', 1, now, 0, false)).toEqual([{ from: 14, to: 14, insert: '0905 ' }])
  })

  it('fill: 既定のタイムゾーンがUTC以外なら、timezone の行も入れる', () => {
    const now = Date.UTC(2026, 9, 18, 9, 5, 30)
    expect(fill('ja1xyz', 0, now, 9, false)).toEqual([{ from: 0, to: 0, insert: 'timezone +9\n1805 ' }])
  })

  it('fill(full): 時刻・バンド・モード・RSTまで確定する修正を返す', () => {
    const now = Date.UTC(2026, 9, 18, 9, 5, 30)
    const text = '40m cw\nja1xyz'
    const edits = fill(text, 1, now, 0, true) as { from: number; to: number; insert: string }[]
    const result = [...edits]
      .sort((a, b) => b.from - a.from)
      .reduce((t, e) => t.slice(0, e.from) + e.insert + t.slice(e.to), text)
    expect(result).toBe('40m cw\n0905 40m CW ja1xyz 599 599')
  })

  it('generateZip: ZIPのシグネチャで始まる', () => {
    const zip = generateZip(SAMPLE, Date.UTC(2026, 9, 18, 9, 30, 45))
    expect(zip).toBeInstanceOf(Uint8Array)
    expect(Array.from(zip.slice(0, 2))).toEqual([0x50, 0x4b]) // "PK"
  })

  it('generateZip: 空入力は例外', () => {
    expect(() => generateZip('', 0)).toThrow()
  })
})
