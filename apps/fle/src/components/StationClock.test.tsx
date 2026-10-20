// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { StationClock } from './StationClock'
import type { LineInfo } from '@/lib/fle'

const info = (patch: Partial<LineInfo>) => ({ mycall: '', sota: '', pota: [], wwff: '', ...patch }) as LineInfo

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-18T23:50:05Z'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('StationClock', () => {
  it('ログの時間帯の時刻(秒まで)と、UTC の時刻。1秒ごとに進む', () => {
    render(<StationClock info={null} tz={9} />)
    const group = screen.getByRole('group', { name: '時刻と運用先' })
    expect(group).toHaveTextContent('08:50:05')
    expect(group).toHaveTextContent('JST')
    expect(group).toHaveTextContent('UTC 23:50')
    act(() => vi.advanceTimersByTime(1000))
    expect(group).toHaveTextContent('08:50:06')
  })

  it('UTC のログでは、UTC の時刻だけ', () => {
    render(<StationClock info={null} tz={0} />)
    const group = screen.getByRole('group', { name: '時刻と運用先' })
    expect(group).toHaveTextContent('23:50:05')
    expect(group).not.toHaveTextContent('UTC 23:50')
  })

  it('自局のコールサインと、運用先(山・WWFF・公園の n-fer)', () => {
    render(
      <StationClock
        info={info({ mycall: 'JA1ZZZ/1', sota: 'JA/TK-001', wwff: 'JAFF-0001', pota: ['JA-0001', 'JA-0002'] })}
        tz={0}
      />
    )
    for (const code of ['JA1ZZZ/1', 'JA/TK-001', 'JAFF-0001', 'JA-0001', 'JA-0002']) {
      expect(screen.getByText(code)).toBeInTheDocument()
    }
  })

  it('運用先がまだなければ、時刻だけ', () => {
    render(<StationClock info={info({})} tz={0} />)
    expect(screen.getByRole('group').textContent).toBe('23:50:05UTC')
  })
})
