// @vitest-environment node
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emptyPlan, isDeleted, livePlans, type Plan } from './plans'
import {
  SYNCED_KEYS,
  codeFromText,
  formatCode,
  generateCode,
  isCode,
  join,
  mergeSettings,
  pull,
  push,
  syncOnce,
  syncUrl,
  type SyncDoc,
  type SyncState,
  type SyncedSettings,
} from './sync'

// サーバーの関数そのものを、偽の KV で動かして、クライアントと組み合わせて確かめる。
// 関数は Cloudflare の型(workers-types)を使うので、アプリの型の検査には載せず、実行時に読み込む
const functionPath = fileURLToPath(new URL('../../../../functions/api/fle/prefs/[code].ts', import.meta.url))
const { onRequest } = (await import(/* @vite-ignore */ functionPath)) as {
  onRequest: (context: { request: Request; env: unknown; params: { code: string } }) => Promise<Response>
}

const settings = (over: Partial<SyncedSettings> = {}): SyncedSettings => ({
  rigs: [],
  timezone: 9,
  writeBandMode: false,
  writeRst: true,
  language: 'auto',
  ...over,
})
const plan = (id: string, over: Partial<Plan> = {}): Plan => ({ ...emptyPlan(id, 1000, 'JA1ABC'), ...over })
const doc = (s: Partial<SyncedSettings> = {}, plans: Plan[] = []): SyncDoc => ({ settings: settings(s), plans })

/** サーバーの関数を呼ぶ fetch(KV は Map) */
function fakeServer(kvEnabled = true) {
  const store = new Map<string, string>()
  const kv = {
    get: async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null),
    put: async (k: string, v: string) => void store.set(k, v),
    delete: async (k: string) => void store.delete(k),
  }
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const code = String(url).split('/').pop()!
    return onRequest({
      request: new Request(`https://x.test${url}`, init),
      env: kvEnabled ? { FLE_PREFS: kv } : {},
      params: { code },
    })
  }) as typeof fetch
  return { fetchImpl, store }
}

describe('同期コード', () => {
  it('26文字の A-Z2-7。呼ぶたびに違う', () => {
    const a = generateCode()
    expect(isCode(a)).toBe(true)
    expect(generateCode()).not.toBe(a)
  })
  it('URL からも、手で写した文字からも取り出せる', () => {
    const code = generateCode()
    expect(codeFromText(syncUrl(code, 'https://fleonline.sotalive.net'))).toBe(code)
    expect(codeFromText(formatCode(code).toLowerCase())).toBe(code)
    expect(codeFromText(code.match(/.{1,5}/g)!.join('-'))).toBe(code)
    expect(codeFromText('https://example.com/')).toBeNull()
    expect(codeFromText('ABC')).toBeNull()
  })
  it('QR の URL は、# 以降にコードを置く(サーバーに送られない)', () => {
    expect(syncUrl('A'.repeat(26), 'https://h.test')).toBe(`https://h.test/fle/#sync=${'A'.repeat(26)}`)
  })
})

describe('mergeSettings(3者)', () => {
  it('端末で変えていない項目は、サーバーのもの。変えた項目は、端末のもの', () => {
    const snapshot = settings()
    const local = settings({ rigs: ['40mST1'] }) // この端末で、リグを足した
    const remote = settings({ timezone: 0 }) // 別の端末で、時間帯を変えた
    const merged = mergeSettings(local, snapshot, remote)
    expect(merged.rigs).toEqual(['40mST1'])
    expect(merged.timezone).toBe(0)
  })
  it('基準がなければ(初めて)、サーバーのもの', () => {
    expect(mergeSettings(settings({ timezone: 0 }), null, settings({ timezone: 9 })).timezone).toBe(9)
  })
  it('サーバーにない項目は、端末のまま', () => {
    expect(mergeSettings(settings({ rigs: ['a'] }), settings(), {}).rigs).toEqual(['a'])
    expect(SYNCED_KEYS).not.toContain('theme')
    expect(SYNCED_KEYS).not.toContain('digitRow')
  })
})

describe('サーバーとの同期', () => {
  const code = generateCode()
  const state = (snapshot: SyncDoc, base = 0): SyncState => ({ code, base, snapshot })

  it('まだなければ送る。取り直すと同じ内容', async () => {
    const { fetchImpl } = fakeServer()
    const local = doc({ rigs: ['KX2/IC-705+EFHW'] }, [plan('aaaaaaaa1', { title: '高尾山' })])
    const { state: next } = await syncOnce(state(local), local, fetchImpl)
    expect(next.base).toBeGreaterThan(0)
    const remote = await pull(code, fetchImpl)
    expect(remote!.data).toEqual(local)
  })

  it('PC で登録した予定が、スマホに届く(参加)', async () => {
    const { fetchImpl } = fakeServer()
    const pc = doc({ rigs: ['40mST1'] }, [plan('aaaaaaaa1', { title: '高尾山 10/25', sota: 'JA/TK-001', date: '2026-10-25' })])
    await join(code, pc, fetchImpl)

    const phone = doc({ timezone: 0 }, [])
    const { merged } = await join(code, phone, fetchImpl)
    expect(livePlans(merged.plans).map((p) => p.title)).toEqual(['高尾山 10/25'])
    expect(merged.settings.rigs).toEqual(['40mST1'])
    expect(merged.settings.timezone).toBe(9) // サーバーの設定が採用される
  })

  it('参加しても、端末にあった予定は失われない', async () => {
    const { fetchImpl } = fakeServer()
    await join(code, doc({}, [plan('aaaaaaaa1', { title: 'サーバー側' })]), fetchImpl)
    const { merged } = await join(code, doc({}, [plan('bbbbbbbb2', { title: '端末側' })]), fetchImpl)
    expect(livePlans(merged.plans).map((p) => p.title).sort()).toEqual(['サーバー側', '端末側'])
    expect(livePlans((await pull(code, fetchImpl))!.data.plans)).toHaveLength(2)
  })

  it('2台が別々に変えても、食い違いをマージして、両方残る', async () => {
    const { fetchImpl } = fakeServer()
    const base = doc({}, [])
    const a = await join(code, base, fetchImpl) // 端末 A
    const b = await join(code, base, fetchImpl) // 端末 B

    // A がリグを足して同期
    const aLocal = doc({ rigs: ['A-rig'] }, [plan('aaaaaaaa1', { title: 'Aの予定' })])
    await syncOnce(a.state, aLocal, fetchImpl)
    // B は、A に気づかず、時間帯を変えて、別の予定を足して同期(食い違う → マージ)
    const bLocal = doc({ timezone: 0 }, [plan('bbbbbbbb2', { title: 'Bの予定' })])
    const result = await syncOnce(b.state, bLocal, fetchImpl)

    expect(result.merged.settings.rigs).toEqual(['A-rig'])
    expect(result.merged.settings.timezone).toBe(0)
    expect(livePlans(result.merged.plans).map((p) => p.title).sort()).toEqual(['Aの予定', 'Bの予定'])
    expect((await pull(code, fetchImpl))!.data).toEqual(result.merged)
  })

  it('消した予定は、ほかの端末でも消える', async () => {
    const { fetchImpl } = fakeServer()
    const p = plan('aaaaaaaa1', { title: '消す予定' })
    const a = await join(code, doc({}, [p]), fetchImpl)
    const b = await join(code, doc({}, []), fetchImpl)
    expect(livePlans(b.merged.plans)).toHaveLength(1)

    // A が消す(印を残す)
    await syncOnce(a.state, doc({}, [{ id: p.id, updatedAt: Date.now(), deleted: true } as never]), fetchImpl)
    const next = await syncOnce(b.state, b.merged, fetchImpl)
    expect(livePlans(next.merged.plans)).toEqual([])
    expect(next.merged.plans.some(isDeleted)).toBe(true)
  })

  it('サーバーに同期の用意がなければ、unavailable。つながらなければ network', async () => {
    const off = fakeServer(false)
    await expect(pull(code, off.fetchImpl)).rejects.toMatchObject({ kind: 'unavailable' })
    const down = (async () => {
      throw new TypeError('offline')
    }) as typeof fetch
    await expect(pull(code, down)).rejects.toMatchObject({ kind: 'network' })
  })
})

describe('サーバーの検査', () => {
  const code = generateCode()
  const put = async (fetchImpl: typeof fetch, body: unknown) =>
    fetchImpl(`/api/fle/prefs/${code}`, { method: 'PUT', body: JSON.stringify(body) })

  it('形の違う内容・大きすぎる内容・不正なコードは断る', async () => {
    const { fetchImpl } = fakeServer()
    expect((await put(fetchImpl, { base: 0, data: { settings: { rigs: ['a%b'] }, plans: [] } })).status).toBe(400)
    expect((await put(fetchImpl, { base: 0, data: { settings: { timezone: 99 }, plans: [] } })).status).toBe(400)
    expect((await put(fetchImpl, { base: 0, data: { settings: {}, plans: [{ id: 'x' }] } })).status).toBe(400)
    expect((await put(fetchImpl, { base: 'x', data: { settings: {}, plans: [] } })).status).toBe(400)
    const big = { base: 0, data: { settings: {}, plans: [], pad: 'x'.repeat(40_000) } }
    expect((await put(fetchImpl, big)).status).toBe(413)
    expect((await fetchImpl('/api/fle/prefs/short')).status).toBe(400)
  })

  it('知らない項目は、保存しない', async () => {
    const { fetchImpl } = fakeServer()
    const res = await put(fetchImpl, { base: 0, data: { settings: { theme: 'dark', rigs: ['a'] }, plans: [] } })
    expect(res.status).toBe(200)
    expect((await pull(code, fetchImpl))!.data.settings).toEqual({ rigs: ['a'] })
  })

  it('版が違う更新は 409 で、サーバーの内容を返す。DELETE で消える', async () => {
    const { fetchImpl } = fakeServer()
    const d = doc()
    const first = await push(code, 0, d, fetchImpl)
    expect(first.ok).toBe(true)
    const stale = await push(code, 0, d, fetchImpl)
    expect(stale.ok).toBe(false)
    await fetchImpl(`/api/fle/prefs/${code}`, { method: 'DELETE' })
    expect(await pull(code, fetchImpl)).toBeNull()
  })
})
