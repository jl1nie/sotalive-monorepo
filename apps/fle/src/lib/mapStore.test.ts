import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureRegions, refreshRegionOf, resetRegionChecks, type RegionStore } from './mapStore'
import { resetNet } from './net'
import type { SummitMap } from './summitMap'

const MAP = { type: 'FeatureCollection', summit: 'JA/KN-001', bbox: [0, 0, 1, 1], attribution: '', features: [] } as SummitMap
const NOW = Date.parse('2026-10-24T00:00:00Z')
const DAY = 86_400_000
const MIN = 60_000

interface Saved {
  at: number
  version?: string
}

/**
 * 差し替えの保存先。saved: 保存してある地域、fetched: サーバーの地図(なければ取れない)、
 * versions: サーバーの版(なければ聞けない)。`calls` は、呼ばれた順
 */
function store(
  saved: Record<string, Saved | number>,
  fetched: Record<string, SummitMap[] | null>,
  versions: Record<string, string | null> = {}
) {
  const rec = (r: Saved | number) => (typeof r === 'number' ? { at: r } : r)
  const calls: string[] = []
  const s = {
    saved: [] as { region: string; version?: string }[],
    calls,
    list: async () => Object.entries(saved).map(([region, r]) => ({ region, savedAt: new Date(rec(r).at).toISOString(), version: rec(r).version })),
    get: async (region: string) => (saved[region] ? { savedAt: new Date(rec(saved[region]).at).toISOString(), version: rec(saved[region]).version } : null),
    save: vi.fn(async (region: string, _maps: SummitMap[], version?: string) => {
      s.saved.push({ region, version })
      return true
    }),
    fetch: vi.fn(async (region: string) => (calls.push(`maps ${region}`), fetched[region] ?? null)),
    version: vi.fn(async (region: string) => (calls.push(`version ${region}`), versions[region] ?? null)),
    persist: vi.fn(async () => {}),
  }
  return s satisfies RegionStore & { saved: unknown[]; calls: string[] }
}

beforeEach(() => {
  resetRegionChecks()
  resetNet()
})
afterEach(() => vi.unstubAllGlobals())

describe('ensureRegions: 予定の山頂の地図を端末にそろえる', () => {
  it('電波があれば、まだない地域を取って保存する(版つき)', async () => {
    const s = store({}, { 'JA/KN': [MAP] }, { 'JA/KN': 'v1' })
    const status = await ensureRegions(['JA/KN'], true, s, NOW)
    expect(status.get('JA/KN')).toBe('saved')
    expect(s.saved).toEqual([{ region: 'JA/KN', version: 'v1' }])
    expect(s.persist).toHaveBeenCalled()
  })

  it('版が取れなくても、まだない地域は取って保存する', async () => {
    const s = store({}, { 'JA/KN': [MAP] })
    expect((await ensureRegions(['JA/KN'], true, s, NOW)).get('JA/KN')).toBe('saved')
    expect(s.saved).toEqual([{ region: 'JA/KN', version: undefined }])
  })

  it('電波がなければ、通信せず、保存があれば saved・なければ pending', async () => {
    const s = store({ 'JA/KN': NOW - DAY }, {})
    expect((await ensureRegions(['JA/KN', 'JA/ST'], false, s, NOW)).get('JA/KN')).toBe('saved')
    expect((await ensureRegions(['JA/KN', 'JA/ST'], false, s, NOW)).get('JA/ST')).toBe('pending')
    expect(s.version).not.toHaveBeenCalled()
    expect(s.fetch).not.toHaveBeenCalled()
  })

  it('端末はオンラインでも、通信が止まっている(遮断中)なら、通信しない', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const s = store({ 'JA/KN': NOW - DAY }, {})
    expect((await ensureRegions(['JA/KN'], true, s, NOW)).get('JA/KN')).toBe('saved')
    expect(s.version).not.toHaveBeenCalled()
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

describe('版を比べて、更新があった地域だけ取り直す', () => {
  it('版が同じなら、地図を取らない(聞くだけ)', async () => {
    const s = store({ 'JA/KN': { at: NOW - DAY, version: 'v1' } }, {}, { 'JA/KN': 'v1' })
    expect((await ensureRegions(['JA/KN'], true, s, NOW)).get('JA/KN')).toBe('saved')
    expect(s.calls).toEqual(['version JA/KN'])
    expect(s.save).not.toHaveBeenCalled()
  })

  it('版が違えば、取り直して、新しい版つきで保存する', async () => {
    const s = store({ 'JA/KN': { at: NOW - DAY, version: 'v1' } }, { 'JA/KN': [MAP] }, { 'JA/KN': 'v2' })
    expect((await ensureRegions(['JA/KN'], true, s, NOW)).get('JA/KN')).toBe('saved')
    expect(s.saved).toEqual([{ region: 'JA/KN', version: 'v2' }])
  })

  it('版を、地図より先に取る(取る間に更新が入っても、次に違いが分かる)', async () => {
    const s = store({ 'JA/KN': { at: NOW - DAY, version: 'v1' } }, { 'JA/KN': [MAP] }, { 'JA/KN': 'v2' })
    await ensureRegions(['JA/KN'], true, s, NOW)
    expect(s.calls).toEqual(['version JA/KN', 'maps JA/KN'])
  })

  it('版を持たない古い記録は、一度取り直す', async () => {
    const s = store({ 'JA/KN': NOW - DAY }, { 'JA/KN': [MAP] }, { 'JA/KN': 'v1' })
    await ensureRegions(['JA/KN'], true, s, NOW)
    expect(s.saved).toEqual([{ region: 'JA/KN', version: 'v1' }])
  })

  it('取り直しに失敗しても、前の記録は残す(保存しない)。状態は saved', async () => {
    const s = store({ 'JA/KN': { at: NOW - DAY, version: 'v1' } }, {}, { 'JA/KN': 'v2' })
    expect((await ensureRegions(['JA/KN'], true, s, NOW)).get('JA/KN')).toBe('saved')
    expect(s.save).not.toHaveBeenCalled()
  })

  it('サーバーが空を返しても、保存してある地図は消さない', async () => {
    const s = store({ 'JA/KN': { at: NOW - DAY, version: 'v1' } }, { 'JA/KN': [] }, { 'JA/KN': 'v2' })
    expect((await ensureRegions(['JA/KN'], true, s, NOW)).get('JA/KN')).toBe('saved')
    expect(s.save).not.toHaveBeenCalled()
  })

  it('版が取れないとき: 保存から 30 日以内なら取り直さない', async () => {
    const s = store({ 'JA/KN': { at: NOW - 29 * DAY, version: 'v1' } }, { 'JA/KN': [MAP] })
    expect((await ensureRegions(['JA/KN'], true, s, NOW)).get('JA/KN')).toBe('saved')
    expect(s.fetch).not.toHaveBeenCalled()
  })

  it('版が取れないとき: 30 日を超えたら取り直す(保険)。取れなくても saved', async () => {
    const s = store({ 'JA/KN': { at: NOW - 40 * DAY, version: 'v1' } }, {})
    expect((await ensureRegions(['JA/KN'], true, s, NOW)).get('JA/KN')).toBe('saved')
    expect(s.fetch).toHaveBeenCalledWith('JA/KN')
    const s2 = store({ 'JA/KN': { at: NOW - 40 * DAY } }, { 'JA/KN': [MAP] })
    await ensureRegions(['JA/KN'], true, s2, NOW)
    expect(s2.saved).toEqual([{ region: 'JA/KN', version: undefined }])
  })

  it('保存してある地域だけ確かめる(予定にない地域は聞かない)', async () => {
    const s = store({ 'JA/KN': { at: NOW - DAY, version: 'v1' }, 'JA/ST': { at: NOW - DAY, version: 'v1' } }, {}, { 'JA/KN': 'v1' })
    await ensureRegions(['JA/KN'], true, s, NOW)
    expect(s.calls).toEqual(['version JA/KN'])
  })
})

describe('同じ地域を、短い間に聞き直さない', () => {
  it('10 分以内は聞かない。過ぎたら聞く', async () => {
    const s = store({ 'JA/KN': { at: NOW - DAY, version: 'v1' } }, {}, { 'JA/KN': 'v1' })
    await ensureRegions(['JA/KN'], true, s, NOW)
    await ensureRegions(['JA/KN'], true, s, NOW + 9 * MIN)
    expect(s.version).toHaveBeenCalledTimes(1)
    await ensureRegions(['JA/KN'], true, s, NOW + 11 * MIN)
    expect(s.version).toHaveBeenCalledTimes(2)
  })

  it('取り直しに失敗したときは、抑制しない(次に開いたとき、また試す)', async () => {
    const s = store({ 'JA/KN': { at: NOW - DAY, version: 'v1' } }, {}, { 'JA/KN': 'v2' })
    await ensureRegions(['JA/KN'], true, s, NOW)
    await ensureRegions(['JA/KN'], true, s, NOW + MIN)
    expect(s.version).toHaveBeenCalledTimes(2)
  })

  it('保存がない地域は、抑制しない', async () => {
    const s = store({}, {})
    await ensureRegions(['JA/KN'], true, s, NOW)
    await ensureRegions(['JA/KN'], true, s, NOW + MIN)
    expect(s.version).toHaveBeenCalledTimes(2)
  })
})

describe('refreshRegionOf: 地図を開いたとき・場所を決めたとき', () => {
  it('山頂の地域が分からなければ null', async () => {
    expect(await refreshRegionOf('', store({}, {}), NOW)).toBeNull()
  })

  it('保存がなければ、取って保存する(updated)', async () => {
    const s = store({}, { 'JA/KN': [MAP] }, { 'JA/KN': 'v1' })
    expect(await refreshRegionOf('JA/KN-017', s, NOW)).toBe('updated')
    expect(s.saved).toEqual([{ region: 'JA/KN', version: 'v1' }])
  })

  it('版が同じなら current(地図を取らない)', async () => {
    const s = store({ 'JA/KN': { at: NOW - DAY, version: 'v1' } }, {}, { 'JA/KN': 'v1' })
    expect(await refreshRegionOf('JA/KN-017', s, NOW)).toBe('current')
    expect(s.fetch).not.toHaveBeenCalled()
  })

  it('版が違えば updated', async () => {
    const s = store({ 'JA/KN': { at: NOW - DAY, version: 'v1' } }, { 'JA/KN': [MAP] }, { 'JA/KN': 'v2' })
    expect(await refreshRegionOf('JA/KN-017', s, NOW)).toBe('updated')
  })

  it('通信が止まっていれば、待たずに返る(保存があれば saved、なければ pending)', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const s = store({ 'JA/KN': NOW - DAY }, {})
    expect(await refreshRegionOf('JA/KN-017', s, NOW)).toBe('saved')
    expect(await refreshRegionOf('JA/ST-001', s, NOW)).toBe('pending')
    expect(s.version).not.toHaveBeenCalled()
    expect(s.fetch).not.toHaveBeenCalled()
  })
})
