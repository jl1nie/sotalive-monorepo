import { describe, expect, it } from 'vitest'
import { buildRows, spotsPath, targets, type SpotGroup } from './spots.ts'

const spot = (program: string, reference: string, t: string, qsos: number | null = null) => ({
  program, reference, activator: 'JA1XYZ', frequency: '7.030', mode: 'CW', comment: null, spotTime: t, qsos,
})
const groups: SpotGroup[] = [
  { key: 'JA/KN-006', values: [spot('SOTA', 'JA/KN-006', '2026-10-27T01:00:00Z')] },
  { key: 'JP-0118', values: [spot('POTA', 'JP-0118', '2026-10-27T01:10:00Z'), spot('POTA', 'JP-0118', '2026-10-27T01:30:00Z')] },
]

describe('spotsPath', () => {
  it('旧版と同じクエリ(参照ごと・Hunter のログ ID があれば付ける)', () => {
    expect(spotsPath({ hours: 6, byCall: false, logId: null })).toBe('/activation/spots?pat_ref=%5E%28JA%7CJP-%29&by_ref=null&hours_ago=6')
    expect(spotsPath({ hours: 3, byCall: true, logId: 'h-1' })).toBe('/activation/spots?pat_ref=%5E%28JA%7CJP-%29&log_id=h-1&by_call=null&hours_ago=3')
  })
})
describe('buildRows', () => {
  it('POTA が先。プログラムで絞る', () => {
    expect(targets('SOTA/POTA')).toEqual(['POTA', 'SOTA'])
    expect(buildRows(groups, 'SOTA/POTA', { byCall: false, showPotalog: false }).map((r) => r.key)).toEqual(['JP-0118', 'JA/KN-006'])
    expect(buildRows(groups, 'SOTA', { byCall: false, showPotalog: false }).map((r) => r.key)).toEqual(['JA/KN-006'])
  })
  it('最新の時刻・ツールチップの文', () => {
    const [r] = buildRows(groups, 'POTA', { byCall: false, showPotalog: false })
    expect(r.latest.toISOString()).toBe('2026-10-27T01:30:00.000Z')
    expect(r.points[0].label).toBe('JA1XYZ JP-0118 7.030 CW')
  })
  it('POTA ログを使っていて、QSO がまだない参照だけ needed(SOTA・コールサインごとは対象外)', () => {
    const g: SpotGroup[] = [groups[1], { key: 'JP-0001', values: [spot('POTA', 'JP-0001', '2026-10-27T01:00:00Z', 3)] }]
    expect(buildRows(g, 'POTA', { byCall: false, showPotalog: true }).map((r) => r.needed)).toEqual([true, false])
    expect(buildRows(g, 'POTA', { byCall: false, showPotalog: false }).map((r) => r.needed)).toEqual([false, false])
    expect(buildRows(g, 'POTA', { byCall: true, showPotalog: true }).map((r) => r.needed)).toEqual([false, false])
  })
})
