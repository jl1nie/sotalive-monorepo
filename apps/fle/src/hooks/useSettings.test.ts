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
