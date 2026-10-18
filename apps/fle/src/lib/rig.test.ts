import { describe, expect, it } from 'vitest'
import { parseRigs, rigCompletion, MAX_RIGS } from './rig'

describe('parseRigs', () => {
  it('前後の空白・空の行・重複・% を除く', () => {
    expect(parseRigs('  40mST1 \n\n20mST1\n40mST1\nKX2/IC-705+EFHW%\n')).toEqual([
      '40mST1',
      '20mST1',
      'KX2/IC-705+EFHW',
    ])
  })
  it('多すぎるときは、先頭から数を限る', () => {
    const text = Array.from({ length: MAX_RIGS + 5 }, (_, i) => `rig${i}`).join('\n')
    expect(parseRigs(text)).toHaveLength(MAX_RIGS)
  })
})

describe('rigCompletion', () => {
  const rigs = ['40mST1', '20mST1', 'KX2/IC-705+EFHW']

  it('rig の行で、値を打つ前は、全部を出す。置き換えは値の位置から', () => {
    const text = 'mycall JA1ABC\nrig '
    const c = rigCompletion(text, rigs)!
    expect(c.candidates.map((x) => x.text)).toEqual(rigs)
    expect(c.candidates[0].kind).toBe('rig')
    expect(text.slice(c.from)).toBe('')
  })

  it('打った文字(大文字小文字は問わない)で絞る。打ち終わった値は出さない', () => {
    expect(rigCompletion('rig 4', rigs)!.candidates.map((x) => x.text)).toEqual(['40mST1'])
    expect(rigCompletion('rig kx2', rigs)!.candidates.map((x) => x.text)).toEqual(['KX2/IC-705+EFHW'])
    expect(rigCompletion('rig 40mST1', rigs)!.candidates).toEqual([])
  })

  it('rig の行でなければ null(コアの補完を使う)。一覧が空でも null', () => {
    expect(rigCompletion('0900 ja1xyz', rigs)).toBeNull()
    expect(rigCompletion('rigset 1', rigs)).toBeNull()
    expect(rigCompletion('rig ', [])).toBeNull()
  })
})
