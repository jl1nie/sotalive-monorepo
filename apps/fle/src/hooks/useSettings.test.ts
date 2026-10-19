// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useSettings } from './useSettings'
import { SYNCED_KEYS } from '@/lib/sync'

const KEY = 'fle.settings'

beforeEach(() => {
  // jsdom には matchMedia がない(テーマの反映と、タッチ端末の判定で使う)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  // Node 25 以降は、組み込みの localStorage が jsdom のものを隠してしまう。メモリ上の Storage に差し替える
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useSettings: 入力欄の文字', () => {
  it('初めては、等幅(Roboto Mono)', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.editorFont).toBe('mono')
  })

  it('ゴシックを選ぶと保存され、開き直してもゴシック', () => {
    const first = renderHook(() => useSettings())
    act(() => first.result.current.update({ editorFont: 'gothic' }))
    expect(JSON.parse(localStorage.getItem(KEY)!).editorFont).toBe('gothic')
    const again = renderHook(() => useSettings())
    expect(again.result.current.settings.editorFont).toBe('gothic')
  })

  it('知らない値は、等幅として読む', () => {
    localStorage.setItem(KEY, JSON.stringify({ editorFont: 'serif' }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.editorFont).toBe('mono')
  })
})

describe('useSettings: QSO の数', () => {
  it('初めては、その日 / 全体', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.qsoCount).toBe('day')
  })

  it('全体を選ぶと保存され、知らない値は、その日 / 全体として読む', () => {
    const first = renderHook(() => useSettings())
    act(() => first.result.current.update({ qsoCount: 'total' }))
    expect(renderHook(() => useSettings()).result.current.settings.qsoCount).toBe('total')
    localStorage.setItem(KEY, JSON.stringify({ qsoCount: 'week' }))
    expect(renderHook(() => useSettings()).result.current.settings.qsoCount).toBe('day')
  })
})

describe('useSettings: 時刻を自動で入れる', () => {
  it('初めてはオン。オフにすると保存され、同期の対象ではない', () => {
    const first = renderHook(() => useSettings())
    expect(first.result.current.settings.autoTime).toBe(true)
    act(() => first.result.current.update({ autoTime: false }))
    expect(renderHook(() => useSettings()).result.current.settings.autoTime).toBe(false)
    expect(SYNCED_KEYS).not.toContain('autoTime')
  })
})
