import { describe, expect, it } from 'vitest'
import { clockFits, clockMarginRem, type LogMetrics } from './useClockRoom'

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

// 候補バーとキーボードの間(`gap-2` = 0.5rem)と同じだけ、情報窓とログ窓の間を空ける(テスターの希望。行間 31)
const GAP_BELOW_REM = 0.5

describe('clockMarginRem: 情報窓とログ窓の間の余白', () => {
  it('3 行(時刻・運用先・メモ)でも、文字の大きさ 小・中・大 のどれでも、0.5rem 以上空く', () => {
    for (const scale of [0.85, 1, 1.2]) {
      expect(clockMarginRem(3, scale), `scale ${scale}`).toBeGreaterThanOrEqual(GAP_BELOW_REM)
    }
  })

  it('行が少なければ、余白はもっと広い(2 行・1 行)', () => {
    expect(clockMarginRem(2, 1)).toBeGreaterThan(clockMarginRem(3, 1))
    expect(clockMarginRem(1, 1)).toBeGreaterThan(clockMarginRem(2, 1))
  })
})
