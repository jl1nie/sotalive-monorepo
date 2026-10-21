// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMemoDraft } from './useMemoDraft'

const lookupMemo = vi.hoisted(() => vi.fn())
vi.mock('@/lib/memo', () => ({ lookupMemo }))

afterEach(() => lookupMemo.mockReset())

describe('useMemoDraft', () => {
  it('触っておらず空なら null(書き込むときに引く)。初期値や引いた結果があれば、その値', async () => {
    const empty = renderHook(() => useMemoDraft(''))
    expect(empty.result.current.value()).toBeNull()
    const initial = renderHook(() => useMemoDraft('JCC 1307 秩父市'))
    expect(initial.result.current.value()).toBe('JCC 1307 秩父市')
    lookupMemo.mockResolvedValue('JCG 17008 南都留郡 富士河口湖町')
    await act(() => empty.result.current.lookup({ lat: 35.5, lon: 138.7 }))
    expect(empty.result.current.memo).toBe('JCG 17008 南都留郡 富士河口湖町')
    expect(empty.result.current.value()).toBe('JCG 17008 南都留郡 富士河口湖町')
  })

  it('手で空にしたら、空(書かない)。手で書いたあとに届いた結果では、上書きしない', async () => {
    const { result } = renderHook(() => useMemoDraft('JCC 1307 秩父市'))
    act(() => result.current.edit(''))
    expect(result.current.value()).toBe('')
    let resolve: (v: string) => void = () => {}
    lookupMemo.mockReturnValue(new Promise<string>((r) => (resolve = r)))
    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.lookup({ lat: 35, lon: 139 })
    })
    expect(result.current.looking).toBe(true)
    act(() => result.current.edit('JCG 10007'))
    await act(async () => {
      resolve('JCC 100103 港区')
      await pending
    })
    expect(result.current.memo).toBe('JCG 10007')
    expect(result.current.looking).toBe(false)
  })

  it('引けなければ(日本の外など)、今の値のまま。予定のメモは、あれば入れる', async () => {
    const { result } = renderHook(() => useMemoDraft('# 前のメモ'))
    lookupMemo.mockResolvedValue('')
    await act(() => result.current.lookup({ lat: 40, lon: -100 }))
    expect(result.current.memo).toBe('# 前のメモ')
    act(() => result.current.fromPlan(''))
    expect(result.current.memo).toBe('# 前のメモ')
    act(() => result.current.fromPlan('JCC 0101 札幌市'))
    expect(result.current.memo).toBe('JCC 0101 札幌市')
  })
})
