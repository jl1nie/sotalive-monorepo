// FLE Online の設定と予定の同期(pages/fle/functions/api/fle/prefs/[code].ts)。KV を差し替えて確かめる
import { describe, expect, it, vi } from 'vitest'
import { onRequest } from '../../pages/fle/functions/api/fle/prefs/[code].ts'

const CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DOC = { settings: { timezone: 9 }, plans: [] }

/** 中身を Map に持つ KV。put の options(expirationTtl)も覚える */
function fakeKv() {
  const store = new Map<string, string>()
  const puts: { key: string; options: unknown }[] = []
  return {
    store,
    puts,
    kv: {
      get: async (key: string) => (store.has(key) ? JSON.parse(store.get(key)!) : null),
      put: async (key: string, value: string, options?: unknown) => {
        puts.push({ key, options })
        store.set(key, value)
      },
      delete: async (key: string) => void store.delete(key),
    },
  }
}

async function call(method: string, init: { code?: string; body?: string; kv?: unknown } = {}) {
  const code = init.code ?? CODE
  const request = new Request(`https://fleonline.sotalive.net/api/fle/prefs/${code}`, { method, body: init.body })
  const env = init.kv === undefined ? {} : { FLE_PREFS: init.kv }
  const context = { request, env, params: { code } } as unknown as Parameters<typeof onRequest>[0]
  const response = await onRequest(context)
  return { status: response.status, body: await response.json() }
}

describe('FLE の同期(KV)', () => {
  it('KV が束縛されていなければ 503', async () => {
    expect((await call('GET')).status).toBe(503)
  })

  it('同期コードの形でなければ 400(小文字・長さ違い・使わない文字)', async () => {
    const { kv } = fakeKv()
    for (const code of ['abcdefghijklmnopqrstuvwxyz', 'ABC', 'ABCDEFGHIJKLMNOPQRSTUVWXY1']) {
      expect((await call('GET', { code, kv })).status, code).toBe(400)
    }
  })

  it('まだ保存していないコードは 404', async () => {
    expect((await call('GET', { kv: fakeKv().kv })).status).toBe(404)
  })

  it('保存して読み直せる。KV の名前は prefs:<コード>、使われなくなったら 400 日で消える', async () => {
    const { kv, puts } = fakeKv()
    const saved = await call('PUT', { kv, body: JSON.stringify({ base: 0, data: DOC }) })
    expect(saved.status).toBe(200)
    expect(typeof saved.body.updatedAt).toBe('number')
    expect(puts).toEqual([{ key: `prefs:${CODE}`, options: { expirationTtl: 400 * 24 * 60 * 60 } }])
    const got = await call('GET', { kv })
    expect(got).toEqual({ status: 200, body: { updatedAt: saved.body.updatedAt, data: DOC } })
  })

  it('知らない項目は捨てて保存する(ログの本文などを送ってきても、残さない)', async () => {
    const { kv } = fakeKv()
    const data = { settings: { timezone: 9, theme: 'dark' }, plans: [], log: 'mycall JA1ABC' }
    await call('PUT', { kv, body: JSON.stringify({ base: 0, data }) })
    expect((await call('GET', { kv })).body.data).toEqual(DOC)
  })

  it('ほかの端末が先に保存していたら(base が違う)409 と、サーバーの内容を返し、上書きしない', async () => {
    const { kv } = fakeKv()
    const first = await call('PUT', { kv, body: JSON.stringify({ base: 0, data: DOC }) })
    const other = { settings: { timezone: 0 }, plans: [] }
    const stale = await call('PUT', { kv, body: JSON.stringify({ base: 0, data: other }) })
    expect(stale).toEqual({ status: 409, body: { updatedAt: first.body.updatedAt, data: DOC } })
    expect((await call('GET', { kv })).body.data).toEqual(DOC)
    // 最新の版を見てからなら、保存できる
    const next = await call('PUT', { kv, body: JSON.stringify({ base: first.body.updatedAt, data: other }) })
    expect(next.status).toBe(200)
  })

  it('版(updatedAt)は、時計が戻っても、前の版より必ず進む', async () => {
    const { kv } = fakeKv()
    vi.spyOn(Date, 'now').mockReturnValue(2_000)
    const first = await call('PUT', { kv, body: JSON.stringify({ base: 0, data: DOC }) })
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const second = await call('PUT', { kv, body: JSON.stringify({ base: first.body.updatedAt, data: DOC }) })
    vi.restoreAllMocks()
    expect(second.body.updatedAt).toBe(2_001)
  })

  it('32KB を超える内容は 413、JSON でなければ 400、形が違えば 400(base がない・予定が配列でない)', async () => {
    const { kv } = fakeKv()
    expect((await call('PUT', { kv, body: 'x'.repeat(32 * 1024 + 1) })).status).toBe(413)
    expect((await call('PUT', { kv, body: '{' })).status).toBe(400)
    expect((await call('PUT', { kv, body: JSON.stringify({ data: DOC }) })).status).toBe(400)
    expect((await call('PUT', { kv, body: JSON.stringify({ base: 0, data: { settings: {}, plans: {} } }) })).status).toBe(400)
  })

  it('おかしな値の設定・予定は 400(タイムゾーンの範囲外・リグの % ・予定の番号・日付の形)', async () => {
    const { kv } = fakeKv()
    const plan = { id: 'abcdefgh1234', updatedAt: 1, title: '', date: '', mycall: '', sota: '', pota: [], wwff: '', grid: '', rig: '', qslmsg: '' }
    const bad = [
      { settings: { timezone: 15 }, plans: [] },
      { settings: { rigs: ['KX2%'] }, plans: [] },
      { settings: {}, plans: [{ ...plan, id: 'x' }] },
      { settings: {}, plans: [{ ...plan, date: '10/25' }] },
    ]
    for (const data of bad) {
      expect((await call('PUT', { kv, body: JSON.stringify({ base: 0, data }) })).status, JSON.stringify(data)).toBe(400)
    }
  })

  it('消した予定の印は、番号と時刻だけを残す', async () => {
    const { kv } = fakeKv()
    const data = { settings: {}, plans: [{ id: 'abcdefgh1234', updatedAt: 5, deleted: true, title: '高尾山' }] }
    await call('PUT', { kv, body: JSON.stringify({ base: 0, data }) })
    expect((await call('GET', { kv })).body.data.plans).toEqual([{ id: 'abcdefgh1234', updatedAt: 5, deleted: true }])
  })

  it('DELETE で消す。消したあとは 404', async () => {
    const { kv } = fakeKv()
    await call('PUT', { kv, body: JSON.stringify({ base: 0, data: DOC }) })
    expect((await call('DELETE', { kv })).status).toBe(200)
    expect((await call('GET', { kv })).status).toBe(404)
  })

  it('ほかのメソッドは 405', async () => {
    expect((await call('POST', { kv: fakeKv().kv, body: '{}' })).status).toBe(405)
  })
})
