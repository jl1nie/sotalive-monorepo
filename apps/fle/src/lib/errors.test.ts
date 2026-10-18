// @vitest-environment node
// 事前に `pnpm wasm` で src/wasm/fle を生成しておくこと。
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { compile, initSync } from '../wasm/fle/fle'
import { errorText } from './errors'
import { resolveLang } from './i18n'

beforeAll(() => {
  initSync({ module: readFileSync(new URL('../wasm/fle/fle_bg.wasm', import.meta.url)) })
})

const first = (text: string) => compile(text).errors[0]

describe('errors', () => {
  it('言語は、設定と端末の言語から決まる', () => {
    expect(resolveLang('auto', 'ja-JP')).toBe('ja')
    expect(resolveLang('auto', 'en-US')).toBe('en')
    expect(resolveLang('en', 'ja-JP')).toBe('en')
    expect(resolveLang('ja', 'en-US')).toBe('ja')
  })

  it('日本語は、コードと値から作り、英語はコアの文面', () => {
    const e = first('mycall\n')
    expect(errorText(e, 'ja')).toContain('mycall')
    expect(errorText(e, 'en')).toBe('Missing operand.')
  })

  it('コアが返す誤りのコードは、すべて日本語の文面を持つ', () => {
    const logs = [
      'date 2026-13-45', 'mycall JA1ABC\n40m cw\n2500 ja1xyz', 'mycall JA1ABC\n40m cw\n0900 ja1aaa ja1bbb',
      'mycall JA1ABC\nja1xyz', 'mycall JA1ABC\n40m\n0900 ja1xyz', 'mycall JA1ABC\n40m cw\n0900 ja1xyz <abc', 'mycall JA1ABC\n40m cw\n05 ja',
      'mycall JA1ABC\n40m cw\n0900 ja1xyz mysota', 'mycall JA1ABC\n40m cw\n0900 ja1xyz 2026-10-19',
      'mycall xx', 'mycall JA1ABC extra', 'mysota ABC', 'timezone x', 'rigset x', 'mygrid zz', 'day x',
      'mycall JA1ABC\n99.999 cw\n0900 ja1xyz', 'mycall JA1ABC\n40m cw\n2330 ja1aaa\n10 ja1bbb\n05 ja1ccc',
    ]
    for (const t of logs) {
      for (const e of compile(t).errors) {
        expect(e.code, t).not.toBe('')
        expect(errorText(e, 'ja'), `${e.code}: ${t}`).not.toBe(e.message)
      }
    }
  })
})
