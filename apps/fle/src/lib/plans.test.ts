import { describe, expect, it } from 'vitest'
import {
  emptyPlan,
  isDeleted,
  livePlans,
  mergePlans,
  newPlanId,
  planLabel,
  sortPlans,
  type Plan,
  type PlanRecord,
} from './plans'

const plan = (id: string, over: Partial<Plan> = {}): Plan => ({ ...emptyPlan(id, 1000, 'JA1ABC'), ...over })
const gone = (id: string, updatedAt: number): PlanRecord => ({ id, updatedAt, deleted: true })

describe('newPlanId', () => {
  it('12文字の英数字。呼ぶたびに違う', () => {
    const a = newPlanId()
    expect(a).toMatch(/^[a-z0-9]{12}$/)
    expect(newPlanId()).not.toBe(a)
  })
})

describe('mergePlans', () => {
  it('別々の予定は、両方残る(PC とスマホで、別の予定を足した)', () => {
    const merged = mergePlans([plan('aaaaaaaa1', { title: 'PC' })], [plan('bbbbbbbb2', { title: 'スマホ' })])
    expect(livePlans(merged).map((p) => p.title).sort()).toEqual(['PC', 'スマホ'])
  })

  it('同じ予定は、新しい更新時刻のほうを残す。同じなら、サーバーのほう', () => {
    const local = plan('aaaaaaaa1', { title: '端末', updatedAt: 2000 })
    const remote = plan('aaaaaaaa1', { title: 'サーバー', updatedAt: 3000 })
    expect(livePlans(mergePlans([local], [remote]))[0].title).toBe('サーバー')
    expect(livePlans(mergePlans([{ ...local, updatedAt: 4000 }], [remote]))[0].title).toBe('端末')
    expect(livePlans(mergePlans([{ ...local, updatedAt: 3000 }], [remote]))[0].title).toBe('サーバー')
  })

  it('消した印は、古い予定を消す。そのあとで直した予定は、残る', () => {
    const old = plan('aaaaaaaa1', { updatedAt: 1000 })
    expect(livePlans(mergePlans([old], [gone('aaaaaaaa1', 2000)]))).toEqual([])
    expect(livePlans(mergePlans([gone('aaaaaaaa1', 2000)], [old]))).toEqual([])
    const edited = plan('aaaaaaaa1', { updatedAt: 3000 })
    expect(livePlans(mergePlans([edited], [gone('aaaaaaaa1', 2000)]))).toEqual([edited])
  })

  it('90日より古い消した印は、捨てる', () => {
    const day = 24 * 60 * 60 * 1000
    const now = 200 * day
    const merged = mergePlans([], [gone('aaaaaaaa1', now - 91 * day), gone('bbbbbbbb2', now - 10 * day)], now)
    expect(merged.filter(isDeleted).map((r) => r.id)).toEqual(['bbbbbbbb2'])
  })
})

describe('sortPlans', () => {
  it('今日以降の近い順 → 日付なし(新しい順)→ 過ぎたもの(新しい順)', () => {
    const plans = [
      plan('past0001', { date: '2026-10-01' }),
      plan('none0001', { updatedAt: 1 }),
      plan('later001', { date: '2026-11-03' }),
      plan('today001', { date: '2026-10-25' }),
      plan('none0002', { updatedAt: 9 }),
      plan('past0002', { date: '2026-10-20' }),
    ]
    expect(sortPlans(plans, '2026-10-25').map((p) => p.id)).toEqual([
      'today001',
      'later001',
      'none0002',
      'none0001',
      'past0002',
      'past0001',
    ])
  })
})

describe('planLabel', () => {
  it('名前があればそれ。なければ行き先、自局', () => {
    expect(planLabel(plan('a', { title: '高尾山 10/25' }))).toBe('高尾山 10/25')
    expect(planLabel(plan('a', { sota: 'JA/TK-001', pota: ['JA-0001'] }))).toBe('JA/TK-001 JA-0001')
    expect(planLabel(plan('a'))).toBe('JA1ABC')
  })
})

describe('mergePlans: 消した印の数', () => {
  it('新しい順に 200 件だけ残す', () => {
    const now = 1_800_000_000_000
    const dead = Array.from({ length: 205 }, (_, i) => ({ id: `dead${String(i).padStart(8, '0')}`, updatedAt: now - i, deleted: true as const }))
    const merged = mergePlans(dead, [], now)
    expect(merged).toHaveLength(200)
    expect(merged.some((r) => r.id === 'dead00000204')).toBe(false)
    expect(merged.some((r) => r.id === 'dead00000000')).toBe(true)
  })
})
