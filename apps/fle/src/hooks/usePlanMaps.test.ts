// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ensureRegions } from '@/lib/mapStore'
import { usePlanMaps } from './usePlanMaps'
import type { Plan } from '@/lib/plans'

vi.mock('@/lib/mapStore', () => ({ ensureRegions: vi.fn() }))

const plan = { id: '1', name: 'x', sota: 'JA/KN-001' } as unknown as Plan

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(ensureRegions).mockReset()
})

describe('usePlanMaps: 予定の山頂の地図は、開いたときと予定が変わったときだけ確かめる', () => {
  it('電波が戻っても(online)、確かめない(電波が途切れ途切れの山頂で通信しない)', async () => {
    vi.mocked(ensureRegions).mockResolvedValue(new Map([['JA/KN', 'saved']]))
    renderHook(() => usePlanMaps([plan]))
    await act(async () => {})
    expect(ensureRegions).toHaveBeenCalledTimes(1)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(ensureRegions).toHaveBeenCalledTimes(1)
  })

  it('取れなかった地域(pending)も、自動では取り直さない', async () => {
    vi.useFakeTimers()
    vi.mocked(ensureRegions).mockResolvedValue(new Map([['JA/KN', 'pending']]))
    renderHook(() => usePlanMaps([plan]))
    await act(async () => {})
    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000)
    })
    expect(ensureRegions).toHaveBeenCalledTimes(1)
  })
})
