import { describe, expect, it } from 'vitest'
import { formatClock } from './clock.ts'

describe('formatClock', () => {
  const d = new Date(2026, 9, 27, 8, 5)
  it('YY/MM/DD HH:mm + 地磁気', () => expect(formatClock(d, { aIndex: 5, kIndex: [1] })).toBe('26/10/27 08:05 A:5 K:1'))
  it('地磁気が取れなければ、時刻だけ', () => expect(formatClock(d, null)).toBe('26/10/27 08:05'))
})
