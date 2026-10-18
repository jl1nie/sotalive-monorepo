import { describe, expect, it } from 'vitest'
import { lineOf, lineRange, replaceToken } from './lines'

describe('lineOf', () => {
  it('改行の数で行を数える', () => {
    const t = 'ab\ncd\nef'
    expect(lineOf(t, 0)).toBe(0)
    expect(lineOf(t, 2)).toBe(0) // 行末
    expect(lineOf(t, 3)).toBe(1) // 2行目の先頭
    expect(lineOf(t, t.length)).toBe(2)
  })

  it('範囲外の位置は末尾として扱う', () => {
    expect(lineOf('a\nb', 99)).toBe(1)
  })
})

describe('lineRange', () => {
  const t = 'ab\ncd\nef'
  it('各行の開始と終了を返す', () => {
    expect(lineRange(t, 0)).toEqual([0, 2])
    expect(lineRange(t, 1)).toEqual([3, 5])
    expect(lineRange(t, 2)).toEqual([6, 8])
  })
  it('行が無ければ末尾', () => {
    expect(lineRange(t, 9)).toEqual([8, 8])
  })
})

describe('replaceToken', () => {
  it('カーソル直前の語を置き換えて空白を足す', () => {
    expect(replaceToken('mys', 3, 'mysota')).toEqual({ text: 'mysota ', caret: 7 })
  })

  it('行の途中でも、その語だけを置き換える', () => {
    expect(replaceToken('40m cw\nmy\nssb', 9, 'mycall')).toEqual({
      text: '40m cw\nmycall \nssb',
      caret: 14,
    })
  })

  it('語が空(空白の直後)なら、そのまま挿入する', () => {
    expect(replaceToken('day ', 4, '+')).toEqual({ text: 'day + ', caret: 6 })
  })

  it('すぐ後ろが空白なら、空白を重ねない', () => {
    expect(replaceToken('mys x', 3, 'mysota')).toEqual({ text: 'mysota x', caret: 7 })
  })
})
