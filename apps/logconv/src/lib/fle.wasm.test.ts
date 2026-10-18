// @vitest-environment node
// 事前に `pnpm wasm` で src/wasm/fle を生成しておくこと。
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { initSync, compile, generateZip } from '../wasm/fle/fle'

const SAMPLE = 'mycall JA1ABC\ndate 2024-01-15\nmysota JA/TK-001\n40m cw\n0900 JA1XYZ 599 599\n'

beforeAll(() => {
  initSync({ module: readFileSync(new URL('../wasm/fle/fle_bg.wasm', import.meta.url)) })
})

describe('fle wasm', () => {
  it('compile: 正常なログを表示用データにする', () => {
    const view = compile(SAMPLE)
    expect(view.status).toBe('OK')
    expect(view.mycall).toBe('JA1ABC')
    expect(view.logtext[0][4]).toBe('JA1XYZ')
  })

  it('compile: 誤りがあるとERRと行情報を返す', () => {
    const view = compile('mycall\n')
    expect(view.status).toBe('ERR')
    expect(view.logtext[0]).toEqual(['0', 'Missing operand.', ''])
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
