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

describe('useSettings: 画面の配置', () => {
  it('初めては、従来の配置', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.layout).toBe('classic')
  })

  it('コンパクトを選ぶと保存され、開き直してもコンパクト。知らない値は従来として読む', () => {
    const first = renderHook(() => useSettings())
    act(() => first.result.current.update({ layout: 'compact' }))
    expect(renderHook(() => useSettings()).result.current.settings.layout).toBe('compact')
    localStorage.setItem(KEY, JSON.stringify({ layout: 'grid' }))
    expect(renderHook(() => useSettings()).result.current.settings.layout).toBe('classic')
  })

  it('フルキーを選ぶと保存され、開き直してもフルキー', () => {
    const first = renderHook(() => useSettings())
    act(() => first.result.current.update({ layout: 'fullkey' }))
    expect(renderHook(() => useSettings()).result.current.settings.layout).toBe('fullkey')
  })

  it('同期しない(端末ごとに選ぶ)', () => {
    expect(SYNCED_KEYS).not.toContain('layout')
    expect(SYNCED_KEYS).not.toContain('writeRstCompact')
  })

  it('確定で RST を書くかは、従来はリリース版のまま書き、コンパクトは書かない', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.writeRst).toBe(true)
    expect(result.current.settings.writeRstCompact).toBe(false)
  })
})

describe('useSettings: スマホで初めて使うときは、フルキー', () => {
  const touch = () =>
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', addEventListener() {}, removeEventListener() {} }))

  it('スマホで初めて使うときは、フルキーで始まり、それを覚える', () => {
    touch()
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.layout).toBe('fullkey')
    expect(JSON.parse(localStorage.getItem(KEY)!).layout).toBe('fullkey')
    // あとでログができても、フルキーのまま
    localStorage.setItem('fle.log', '40m cw')
    expect(renderHook(() => useSettings()).result.current.settings.layout).toBe('fullkey')
  })

  it('前から使っているスマホ(ログがある)は、設定を変えたことがなくても、従来のまま', () => {
    touch()
    localStorage.setItem('fle.log', 'mycall JA1ABC')
    expect(renderHook(() => useSettings()).result.current.settings.layout).toBe('classic')
  })

  it('配置を選ばずに設定を保存していたスマホは、従来のまま', () => {
    touch()
    localStorage.setItem(KEY, JSON.stringify({ theme: 'dark' }))
    expect(renderHook(() => useSettings()).result.current.settings.layout).toBe('classic')
  })

  it('PC では、初めてでも従来', () => {
    expect(renderHook(() => useSettings()).result.current.settings.layout).toBe('classic')
  })
})

describe('useSettings: フルキーのキーの高さ', () => {
  it('初めては正方形(1)。倍率を保存し、範囲の外の値は 1 として読む', () => {
    const first = renderHook(() => useSettings())
    expect(first.result.current.settings.keyScale).toBe(1)
    act(() => first.result.current.update({ keyScale: 1.25 }))
    expect(renderHook(() => useSettings()).result.current.settings.keyScale).toBe(1.25)
    localStorage.setItem(KEY, JSON.stringify({ keyScale: 3 }))
    expect(renderHook(() => useSettings()).result.current.settings.keyScale).toBe(1)
  })

  it('同期しない(端末ごと)', () => {
    expect(SYNCED_KEYS).not.toContain('keyScale')
  })
})
