import { describe, expect, it } from 'vitest'
import { draggedLines, fitLines, openLines, type LogMetrics } from './useLogHeight'

// 使える高さ 500px、つまみ 24px、1行 26px、枠と余白 28px、時刻と運用先 80px
const M: LogMetrics = { box: 500, handle: 24, line: 26, chrome: 28, clock: 80 }

describe('fitLines', () => {
  it('上に時刻と運用先が入る行数なら、その行数', () => {
    // 14行: 500 - 24 - (14*26 + 28) = 84 ≧ 80
    expect(fitLines(14, M)).toBe(14)
    expect(fitLines(1, M)).toBe(1)
  })

  it('入らなければ 0(入る限り高く。ログ欄だけにして、半端な隙間を作らない)', () => {
    // 15行: 500 - 24 - (15*26 + 28) = 58 < 80
    expect(fitLines(15, M)).toBe(0)
    expect(fitLines(100, M)).toBe(0)
  })

  it('0 は、入る限り高く', () => {
    expect(fitLines(0, M)).toBe(0)
  })

  it('使える高さが減ったら(OS のキーボードが出たときなど)、同じ行数でもログ欄だけになる', () => {
    expect(fitLines(6, M)).toBe(6)
    expect(fitLines(6, { ...M, box: 250 })).toBe(0)
  })
})

describe('draggedLines', () => {
  const full = M.box - M.handle // 入る限り高いときのログ欄の高さ
  it('下へ引くと低く(行数で)。2行(前の行と、打っている行)より低くはしない', () => {
    expect(draggedLines(full, 260, M)).toBe(7) // (476 - 260 - 28) / 26 ≒ 7.2
    expect(draggedLines(full, 1000, M)).toBe(2)
  })

  it('上へ引いて、時刻と運用先が入らなくなったら、入る限り高く', () => {
    expect(draggedLines(full, 30, M)).toBe(0)
    expect(draggedLines(6 * 26 + 28, -1000, M)).toBe(0)
  })
})

describe('openLines', () => {
  it('前に使っていた行数に戻す', () => {
    expect(openLines(6, M)).toBe(6)
  })

  it('前の行数がなければ、時刻と運用先が入る限り多く', () => {
    // (500 - 24 - 28 - 80) / 26 ≒ 14.2
    expect(openLines(0, M)).toBe(14)
  })

  it('前の行数が入らなければ(画面が狭くなったなど)、入る限り多く', () => {
    expect(openLines(20, M)).toBe(14)
  })

  it('2行も入らなければ、出せない(0)', () => {
    expect(openLines(6, { ...M, box: 180 })).toBe(0)
  })
})
