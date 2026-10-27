import { describe, expect, it } from 'vitest'
import { expandMessage, payload, type PaddlePlace } from './paddle.ts'

const place: PaddlePlace = { name: '丹沢大山国定公園', sota: 'JA/KN-006', pota: 'JP-0118', jaff: 'JAFF-0050', areacode: '1', century: 'JCC 1112' }

describe('expandMessage', () => {
  it('置き換える。SOTA・POTA・JAFF は、- を除く', () => {
    expect(expandMessage('CQ CQ CQ DE $CALL POTA $POTA +', 'JA1ABC', place, true)).toBe('CQ CQ CQ DE JA1ABC/1 POTA JP0118 +')
    expect(expandMessage('CQ DE $CALL SOTA $SOTA', 'JA1ABC', place, false)).toBe('CQ DE JA1ABC SOTA JA/KN006')
  })
  it('同じ記号が何度あっても、すべて置き換える(旧版は、最初の 1 つだけ。意図した差分)', () => {
    expect(expandMessage('$CALL $CALL $POTA $POTA $JAFF $JAFF $JCC $JCC', 'JA1ABC', place, false)).toBe('JA1ABC JA1ABC JP0118 JP0118 JAFF0050 JAFF0050 JCC 1112 JCC 1112')
  })
  it('エリア番号が空なら、付けない。JCG も、同じ値', () => {
    expect(expandMessage('$CALL $JCG', 'JA1ABC', { ...place, areacode: '', century: 'JCG 1002A' }, true)).toBe('JA1ABC JCG 1002A')
  })
})

describe('payload', () => {
  const prefs = { pemu_wpm: '25', to_paddle: true, paddle_reverse: false }
  it('JSON + CR。キーの並びは、旧版と同じ', () => {
    expect(payload('CQ', prefs)).toBe('{"wpm":25,"to_paddle":"CQ","reverse":false}\r')
    expect(payload('CQ', { ...prefs, to_paddle: false, paddle_reverse: true })).toBe('{"wpm":25,"to_straight":"CQ","reverse":true}\r')
  })
})
