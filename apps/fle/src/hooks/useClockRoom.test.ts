import { describe, expect, it } from 'vitest'
import { clockFits, type LogMetrics } from './useClockRoom'

// 使える高さ 500px、1行 26px、枠と余白 28px、時刻と運用先 104px
const M: LogMetrics = { box: 500, line: 26, chrome: 28, clock: 104 }

describe('clockFits', () => {
  it('上に時刻と運用先を出しても、ログ欄に2行(前の行と、打っている行)が残るなら出す', () => {
    expect(clockFits(M)).toBe(true)
    // ちょうど: 104 + (2*26 + 28) = 184
    expect(clockFits({ ...M, box: 184 })).toBe(true)
  })

  it('残らなければ出さない(OS のキーボードが出て狭くなったときなど。ログ欄だけにする)', () => {
    expect(clockFits({ ...M, box: 183 })).toBe(false)
  })
})
