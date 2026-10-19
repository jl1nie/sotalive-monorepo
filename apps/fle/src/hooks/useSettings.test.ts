// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useSettings } from './useSettings'

const KEY = 'fle.settings'

beforeEach(() => {
  // jsdom には matchMedia がない(テーマの反映と、タッチ端末の判定で使う)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useSettings: 入力欄の文字', () => {
  it('初めては、ゴシック', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.editorFont).toBe('gothic')
  })

  it('等幅を選ぶと保存され、開き直しても等幅', () => {
    const first = renderHook(() => useSettings())
    act(() => first.result.current.update({ editorFont: 'mono' }))
    expect(JSON.parse(localStorage.getItem(KEY)!).editorFont).toBe('mono')
    const again = renderHook(() => useSettings())
    expect(again.result.current.settings.editorFont).toBe('mono')
  })

  it('知らない値は、ゴシックとして読む', () => {
    localStorage.setItem(KEY, JSON.stringify({ editorFont: 'serif' }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.editorFont).toBe('gothic')
  })
})
