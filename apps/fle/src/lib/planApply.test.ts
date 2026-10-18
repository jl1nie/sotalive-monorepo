import { describe, expect, it } from 'vitest'
import { applyEdits } from './edits'
import { extraLines, withExtras, type PlanExtras } from './planApply'

const extras = (over: Partial<PlanExtras> = {}): PlanExtras => ({
  name: '高尾山',
  date: '2026-10-25',
  rig: 'KX2/IC-705+EFHW',
  qslmsg: 'TNX QSO $rig',
  ...over,
})

describe('extraLines', () => {
  it('date → rig → qslmsg の順。空のものは書かない', () => {
    expect(extraLines(extras(), '')).toEqual(['date 2026-10-25', 'rig KX2/IC-705+EFHW', 'qslmsg TNX QSO $rig'])
    expect(extraLines(extras({ date: '', qslmsg: '' }), '')).toEqual(['rig KX2/IC-705+EFHW'])
    expect(extraLines(extras({ date: '', rig: '', qslmsg: '' }), '')).toEqual([])
  })

  it('ログにすでに同じ行があれば、書かない(大文字小文字・空白の違いは無視)', () => {
    const text = 'mycall JA1ABC\nRIG  KX2/IC-705+EFHW\ndate 2026-10-25'
    expect(extraLines(extras(), text)).toEqual(['qslmsg TNX QSO $rig'])
  })

  it('rig の % は除く(HAMLOG のメッセージの区切り)', () => {
    expect(extraLines(extras({ date: '', qslmsg: '', rig: '40m%ST1' }), '')).toEqual(['rig 40mST1'])
  })
})

describe('withExtras', () => {
  const lines = ['rig A', 'qslmsg hi']

  it('自局・運用場所の修正のすぐあとに足す', () => {
    const text = 'x'
    const edits = [{ from: 1, to: 1, insert: '\nmycall JA1ABC\nmysota JA/TK-001\n' }]
    expect(applyEdits(text, withExtras(text, 1, edits, lines))).toBe('x\nmycall JA1ABC\nmysota JA/TK-001\nrig A\nqslmsg hi\n')
  })

  it('修正がなければ、その行の行頭に足す', () => {
    const text = 'mycall JA1ABC\n40m cw\n0900 ja1aaa'
    expect(applyEdits(text, withExtras(text, 1, [], lines))).toBe('mycall JA1ABC\nrig A\nqslmsg hi\n40m cw\n0900 ja1aaa')
  })

  it('末尾(行が足りない)なら、末尾に足す。改行がなければ、改行を挟む', () => {
    expect(applyEdits('mycall JA1ABC', withExtras('mycall JA1ABC', 5, [], lines))).toBe('mycall JA1ABC\nrig A\nqslmsg hi\n')
    expect(applyEdits('', withExtras('', 0, [], lines))).toBe('rig A\nqslmsg hi\n')
    expect(applyEdits('a\n', withExtras('a\n', 9, [], lines))).toBe('a\nrig A\nqslmsg hi\n')
  })

  it('足す行がなければ、何もしない', () => {
    const edits = [{ from: 0, to: 0, insert: 'mycall X\n' }]
    expect(withExtras('', 0, edits, [])).toBe(edits)
  })
})
