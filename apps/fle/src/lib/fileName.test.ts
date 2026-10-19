import { describe, expect, it } from 'vitest'
import { exportName } from './fileName'

const now = new Date(2026, 9, 19, 15, 43)

describe('exportName', () => {
  it('日付@運用場所に、書き出した時刻を付ける', () => {
    expect(exportName('20261019@JA-ST-012-JP-1151', now, 'zip')).toBe('fle-20261019@JA-ST-012-JP-1151-1543.zip')
  })

  it('QSO がまだなければ、端末の日付と時刻だけ', () => {
    expect(exportName(null, now, 'txt')).toBe('fle-20261019-1543.txt')
  })
})
