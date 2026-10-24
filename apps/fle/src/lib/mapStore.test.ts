import { describe, expect, it, vi } from 'vitest'
import { ensureRegions, type RegionStore } from './mapStore'
import type { SummitMap } from './summitMap'

const MAP = { type: 'FeatureCollection', summit: 'JA/KN-001', bbox: [0, 0, 1, 1], attribution: '', features: [] } as SummitMap
const NOW = Date.parse('2026-10-24T00:00:00Z')
const DAY = 86_400_000

function store(saved: Record<string, number>, fetched: Record<string, SummitMap[] | null>): RegionStore & { saved: string[] } {
  const s = {
    saved: [] as string[],
    list: async () => Object.entries(saved).map(([region, at]) => ({ region, savedAt: new Date(at).toISOString() })),
    save: async (region: string) => {
      s.saved.push(region)
      return true
    },
    fetch: vi.fn(async (region: string) => fetched[region] ?? null),
    persist: vi.fn(async () => {}),
  }
  return s
}

describe('ensureRegions: 予定の山頂の地図を端末にそろえる', () => {
  it('電波があれば、まだない地域を取って保存する', async () => {
    const s = store({}, { 'JA/KN': [MAP] })
    const status = await ensureRegions(['JA/KN'], true, s, NOW)
    expect(status.get('JA/KN')).toBe('saved')
    expect(s.saved).toEqual(['JA/KN'])
    expect(s.persist).toHaveBeenCalled()
  })

  it('保存してあって新しければ、取らない(電波がなくても saved)', async () => {
    const s = store({ 'JA/KN': NOW - DAY }, {})
    expect((await ensureRegions(['JA/KN'], true, s, NOW)).get('JA/KN')).toBe('saved')
    expect((await ensureRegions(['JA/KN'], false, s, NOW)).get('JA/KN')).toBe('saved')
    expect(s.fetch).not.toHaveBeenCalled()
  })

  it('古くなった地域は、電波があれば取り直す。取れなくても、前のものがあれば saved', async () => {
    const s = store({ 'JA/KN': NOW - 40 * DAY }, {})
    expect((await ensureRegions(['JA/KN'], true, s, NOW)).get('JA/KN')).toBe('saved')
    expect(s.fetch).toHaveBeenCalledWith('JA/KN')
  })

  it('電波がないか、取れなければ pending(あとで取り直す)', async () => {
    const s = store({}, {})
    expect((await ensureRegions(['JA/KN'], false, s, NOW)).get('JA/KN')).toBe('pending')
    expect((await ensureRegions(['JA/KN'], true, s, NOW)).get('JA/KN')).toBe('pending')
  })

  it('サーバーに地図がない地域は none', async () => {
    const s = store({}, { 'W7/WE': [] })
    expect((await ensureRegions(['W7/WE'], true, s, NOW)).get('W7/WE')).toBe('none')
  })

  it('予定がなければ、何もしない', async () => {
    const s = store({}, {})
    expect((await ensureRegions([], true, s, NOW)).size).toBe(0)
    expect(s.persist).not.toHaveBeenCalled()
  })
})
