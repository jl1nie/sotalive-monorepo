import { describe, expect, it } from 'vitest'
import { lineOf, lineRange, replaceRange } from './lines'

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

describe('replaceRange', () => {
  it('指定の範囲を置き換えて、空白を足す', () => {
    expect(replaceRange('mys', 0, 3, 'mysota')).toEqual({ text: 'mysota ', caret: 7 })
  })

  it('行の途中でも、その範囲だけを置き換える', () => {
    // "40m cw\nmy\nssb" の "my"(7〜9)
    expect(replaceRange('40m cw\nmy\nssb', 7, 9, 'mycall')).toEqual({
      text: '40m cw\nmycall \nssb',
      caret: 14,
    })
  })

  it('範囲が空(空白の直後)なら、そのまま挿入する', () => {
    expect(replaceRange('day ', 4, 4, '+')).toEqual({ text: 'day + ', caret: 6 })
  })

  it('すぐ後ろが空白なら、空白を重ねない', () => {
    expect(replaceRange('mys x', 0, 3, 'mysota')).toEqual({ text: 'mysota x', caret: 7 })
  })
})
