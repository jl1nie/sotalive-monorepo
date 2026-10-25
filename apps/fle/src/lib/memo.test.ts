import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetNet } from './net'
import { lookupMemo, memoAt, memoOf } from './memo'

// 通信の失敗で入る遮断(net)を、テストごとに解く
beforeEach(() => resetNet())
afterEach(() => vi.unstubAllGlobals())

const LOG = ['mycall ja1abc', '# 1つ目のメモ', 'mysota ja/yn-001', '0100 ja1xyz # QSO の後ろのコメント', '＃ JCG 17008 南都留郡', '0110 ja1yyy'].join('\n')

describe('memoAt', () => {
  it('その行までで、行の先頭が # の最後の行(# を除く)。QSO の後ろのコメントは読まない', () => {
    expect(memoAt(LOG, 0)).toBe('')
    expect(memoAt(LOG, 1)).toBe('1つ目のメモ')
    expect(memoAt(LOG, 3)).toBe('1つ目のメモ')
    // 全角の ＃ も
    expect(memoAt(LOG, 5)).toBe('JCG 17008 南都留郡')
    expect(memoAt(LOG, 99)).toBe('JCG 17008 南都留郡')
  })
})

describe('memoOf', () => {
  it('JCC は市(政令市は、区の番号を住所の前に)、JCG は郡と町村', () => {
    expect(memoOf({ jccCode: '100103', municipality: '港区', jccText: '港区' })).toBe('JCC 100103 港区')
    expect(memoOf({ jccCode: '0101', municipality: '札幌市 中央区', wardCode: '010101' })).toBe('JCC 0101 区 010101 札幌市 中央区')
    expect(memoOf({ jcgCode: '17008', jcgText: '南都留郡', municipality: '富士河口湖町' })).toBe('JCG 17008 南都留郡 富士河口湖町')
    expect(memoOf({})).toBe('')
  })
})

/** 国土地理院と sotaapp2 の応答を返す fetch */
function fakeFetch(geo: unknown, jcc: unknown, seen: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    seen.push(url)
    const body = url.includes('gsi.go.jp') ? geo : jcc
    return { ok: true, status: 200, json: async () => body } as Response
  }) as typeof fetch
}

describe('lookupMemo: 通信が止まっているとき', () => {
  it('通信に失敗したあとは、待たずに空を返す(ログの行ごとに待たない)', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('network')
    }) as unknown as typeof fetch
    expect(await lookupMemo(35, 139, { fetchImpl: down })).toBe('')
    expect(down).toHaveBeenCalledTimes(1)
    const next = vi.fn()
    expect(await lookupMemo(35, 139, { fetchImpl: next as never })).toBe('')
    expect(next).not.toHaveBeenCalled()
  })
})

describe('lookupMemo', () => {
  it('緯度・経度から市区町村コードを引き、JCC・JCG を引く', async () => {
    const seen: string[] = []
    const fetchImpl = fakeFetch(
      { results: { muniCd: '19430', lv01Nm: '' } },
      { jcgCode: '17008', jcgText: '南都留郡', municipality: '富士河口湖町' },
      seen
    )
    expect(await lookupMemo(35.36, 138.73, { fetchImpl })).toBe('JCG 17008 南都留郡 富士河口湖町')
    expect(seen[0]).toContain('lat=35.36&lon=138.73')
    expect(seen[1]).toBe('/api/v2/locator/jcc-jcg?muni_code=19430')
  })

  it('日本の外(市区町村コードがない)、通信の誤り、オフラインなら空', async () => {
    expect(await lookupMemo(40, -100, { fetchImpl: fakeFetch({ results: null }, {}) })).toBe('')
    const failing = (async () => ({ ok: false, status: 500 }) as Response) as typeof fetch
    expect(await lookupMemo(35, 139, { fetchImpl: failing })).toBe('')
    const thrown = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    expect(await lookupMemo(35, 139, { fetchImpl: thrown })).toBe('')
    vi.stubGlobal('navigator', { onLine: false })
    const never = vi.fn() as unknown as typeof fetch
    expect(await lookupMemo(35, 139, { fetchImpl: never })).toBe('')
    expect(never).not.toHaveBeenCalled()
  })

  it('緯度・経度がなければ、引かない', async () => {
    const never = vi.fn() as unknown as typeof fetch
    expect(await lookupMemo(NaN, 139, { fetchImpl: never })).toBe('')
    expect(never).not.toHaveBeenCalled()
  })
})
