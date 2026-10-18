import { describe, expect, it } from 'vitest'
import { applyEdits, mapCaret, type Edit } from './edits'

const ins = (from: number, insert: string): Edit => ({ from, to: from, insert })

describe('applyEdits', () => {
  it('複数の挿入を、位置を狂わせずに適用する', () => {
    // 位置はどちらも元のテキストに対するもの
    expect(applyEdits('mycall\nja1xyz', [ins(0, 'timezone +9\n'), ins(7, '1805 ')])).toBe(
      'timezone +9\nmycall\n1805 ja1xyz'
    )
  })

  it('渡す順序に関わらず同じ結果になる', () => {
    const edits = [ins(0, 'A'), ins(3, 'B')]
    expect(applyEdits('xyz', edits)).toBe(applyEdits('xyz', [...edits].reverse()))
  })

  it('置き換えもできる', () => {
    expect(applyEdits('abcdef', [{ from: 1, to: 3, insert: 'X' }])).toBe('aXdef')
  })

  it('修正がなければそのまま', () => {
    expect(applyEdits('abc', [])).toBe('abc')
  })
})

describe('mapCaret', () => {
  it('カーソルより前への挿入の分だけ進む', () => {
    expect(mapCaret(10, [ins(0, 'timezone +9\n'), ins(4, '1805 ')])).toBe(10 + 12 + 5)
  })

  it('カーソルより後ろへの挿入では動かない', () => {
    expect(mapCaret(3, [ins(5, 'X')])).toBe(3)
  })

  it('行末で確定したとき、挿入の分だけ進んだ行末になる', () => {
    // "ja1xyz"(6文字)の行頭に "0905 " を入れ、行末(6)のカーソルが 11 になる
    expect(mapCaret(6, [ins(0, '0905 ')])).toBe(11)
  })
})
