// FLE Online の同期の約束: アプリ(apps/fle)が送る内容を、サーバー(pages/fle/functions/api/fle/prefs)が受け取れるか。
// アプリとサーバーの片方だけを変えたとき(設定の項目を足した・上限を変えた)に落ちるよう、
// アプリの本物の関数(pickSettings など)で作った内容を、サーバーの本物の受け口に通す。
import { describe, expect, it } from 'vitest'
import { onRequest, sanitize } from '../../pages/fle/functions/api/fle/prefs/[code].ts'
import { pickSettings, SYNCED_KEYS, type SyncDoc } from '@/lib/sync'
import { MAX_PLANS, newPlanId, type Plan, type PlanRecord } from '@/lib/plans'
import { MAX_RIGS } from '@/lib/rig'
import { HAMLOG_COLUMN_MAX, TIMEZONE_MAX, TIMEZONE_MIN, type Settings } from '@/hooks/useSettings'
import { HAMLOG_PRESETS } from '@/lib/hamlog'

const CODE = 'A'.repeat(26)

/** 設定の画面で作れる設定(同期しない項目も含む。同期するものは pickSettings が選ぶ) */
function settings(patch: Partial<Settings> = {}): Settings {
  return {
    theme: 'system',
    timezone: 9,
    autoTime: true,
    okTimeForRef: true,
    writeBandMode: false,
    writeRst: true,
    writeRstCompact: false,
    digitRow: false,
    showClock: true,
    fontSize: 'medium',
    qsoCount: 'day',
    keyScale: 1,
    capsLock: false,
    language: 'auto',
    rigs: ['KX2+EFHW', 'IC-705'],
    hamlog: HAMLOG_PRESETS[0].columns,
    hamlogZone: 'jst',
    ...patch,
  } as Settings
}

/** 予定の画面で作れる、いちばん大きい予定(欄の maxLength いっぱい) */
function bigPlan(i: number): Plan {
  return {
    id: newPlanId(),
    title: 'あ'.repeat(60),
    date: '2026-10-25',
    mycall: 'JA1ABC/1',
    sota: 'JA/KN-028',
    pota: ['JP-1290', 'JP-1205'],
    wwff: 'JAFF-0001',
    grid: 'PM95uq',
    rig: 'r'.repeat(60),
    qslmsg: 'q'.repeat(200),
    memo: 'め'.repeat(200),
    updatedAt: 1_800_000_000_000 + i,
  }
}

/** アプリと同じ形(sync.ts の push)で PUT し、サーバーの答えを返す */
async function put(doc: SyncDoc) {
  const store = new Map<string, string>()
  const FLE_PREFS = {
    get: async (key: string) => (store.has(key) ? JSON.parse(store.get(key)!) : null),
    put: async (key: string, value: string) => void store.set(key, value),
    delete: async (key: string) => void store.delete(key),
  }
  const request = new Request(`https://fleonline.sotalive.net/api/fle/prefs/${CODE}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ base: 0, data: doc }),
  })
  const context = { request, env: { FLE_PREFS }, params: { code: CODE } } as unknown as Parameters<typeof onRequest>[0]
  return onRequest(context)
}

describe('FLE の同期: アプリが送る設定', () => {
  it('同期する設定の項目は、サーバーがどれも落とさずに残す(項目を足したら、サーバーにも足す)', () => {
    const doc: SyncDoc = { settings: pickSettings(settings()), plans: [] }
    expect(Object.keys(doc.settings).sort()).toEqual([...SYNCED_KEYS].sort())
    expect(sanitize(doc)).toEqual(doc)
  })

  it('設定の画面で選べる値は、どれも受け取る(タイムゾーンの両端・言語・HAMLOG のプリセットと時刻)', () => {
    for (const timezone of [TIMEZONE_MIN, 0, TIMEZONE_MAX])
      for (const language of ['auto', 'ja', 'en'] as const)
        for (const { columns } of HAMLOG_PRESETS)
          for (const hamlogZone of ['jst', 'utc'] as const) {
            const doc: SyncDoc = { settings: pickSettings(settings({ timezone, language, hamlog: columns, hamlogZone })), plans: [] }
            expect(sanitize(doc), JSON.stringify(doc.settings)).toEqual(doc)
          }
  })

  it('HAMLOG の欄の書式は、アプリの上限の長さまで受け取る', () => {
    const column = '{memo}'.padEnd(HAMLOG_COLUMN_MAX, ' ')
    const doc: SyncDoc = { settings: pickSettings(settings({ hamlog: { qth: column, rmks1: column, rmks2: column } })), plans: [] }
    expect(sanitize(doc)).toEqual(doc)
  })

  it('よく使うリグは、アプリの上限の数まで受け取る', () => {
    const rigs = Array.from({ length: MAX_RIGS }, (_, i) => `RIG-${i}`)
    const doc: SyncDoc = { settings: pickSettings(settings({ rigs })), plans: [] }
    expect(sanitize(doc)).toEqual(doc)
  })

  // 食い違い(アプリとサーバーのどちらに合わせるか、決める前)。直したら it に戻す
  it.fails('よく使うリグは、長い名前でも受け取る(アプリは 1 件の長さに上限がない)', () => {
    const doc: SyncDoc = { settings: pickSettings(settings({ rigs: ['IC-705 + 2 段 GP(自作)+ 10m ケーブル + 予備の EFHW 40m 用'.padEnd(80, '.')] })), plans: [] }
    expect(sanitize(doc)).toEqual(doc)
  })
})

describe('FLE の同期: アプリが送る予定', () => {
  // 食い違い(アプリとサーバーのどちらに合わせるか、決める前)。直したら it に戻す
  it.fails('予定の画面で作れるいちばん大きい予定を、上限の数(50 件)まで、まるごと受け取る(32KB に収まる)', async () => {
    const plans = Array.from({ length: MAX_PLANS }, (_, i) => bigPlan(i))
    const doc: SyncDoc = { settings: pickSettings(settings()), plans }
    expect(sanitize(doc)).toEqual(doc)
    expect((await put(doc)).status).toBe(200)
  })

  // 食い違い(アプリとサーバーのどちらに合わせるか、決める前)。直したら it に戻す
  it.fails('公園が重なるところでは、POTA の公園をいくつでも並べられる(アプリは数に上限がない)', () => {
    const plan = { ...bigPlan(0), pota: ['JP-0001', 'JP-0002', 'JP-0003', 'JP-0004', 'JP-0005', 'JP-0006', 'JP-0007'] }
    const doc: SyncDoc = { settings: pickSettings(settings()), plans: [plan] }
    expect(sanitize(doc)).toEqual(doc)
  })

  // 食い違い(アプリとサーバーのどちらに合わせるか、決める前)。直したら it に戻す
  it.fails('消した予定の印(90 日残る)を含めても、受け取る(生きている予定 50 件 + 消した印)', async () => {
    const live: PlanRecord[] = Array.from({ length: MAX_PLANS }, (_, i) => ({ ...bigPlan(i), title: `p${i}`, qslmsg: '', memo: '', rig: '' }))
    const deleted: PlanRecord[] = Array.from({ length: 30 }, (_, i) => ({ id: newPlanId(), updatedAt: 1_800_000_000_000 + i, deleted: true }))
    const doc: SyncDoc = { settings: pickSettings(settings()), plans: [...live, ...deleted] }
    expect(sanitize(doc)).toEqual(doc)
    expect((await put(doc)).status).toBe(200)
  })
})
