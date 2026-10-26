// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { activeLayout, FONT_SCALE, parseHamlogColumns, touchDevice, useSettings } from './useSettings'
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

describe('useSettings: HAMLOG の時間帯', () => {
  it('初めては JST。UTC を選ぶと保存され、端末の間で同期する', () => {
    const first = renderHook(() => useSettings())
    expect(first.result.current.settings.hamlogZone).toBe('jst')
    act(() => first.result.current.update({ hamlogZone: 'utc' }))
    first.unmount()
    expect(renderHook(() => useSettings()).result.current.settings.hamlogZone).toBe('utc')
    expect(SYNCED_KEYS).toContain('hamlogZone')
  })

  it('知らない値は JST に戻す', () => {
    localStorage.setItem(KEY, JSON.stringify({ hamlogZone: 'pst' }))
    expect(renderHook(() => useSettings()).result.current.settings.hamlogZone).toBe('jst')
  })
})

describe('useSettings: ログ欄の文字の大きさ', () => {
  it('初めては、中(今の大きさ)', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.fontSize).toBe('medium')
    expect(FONT_SCALE).toEqual({ small: 0.85, medium: 1, large: 1.2 })
  })

  it('大きさを選ぶと保存され、開き直しても同じ。同期しない(端末ごと)', () => {
    const first = renderHook(() => useSettings())
    act(() => first.result.current.update({ fontSize: 'large' }))
    expect(JSON.parse(localStorage.getItem(KEY)!).fontSize).toBe('large')
    expect(renderHook(() => useSettings()).result.current.settings.fontSize).toBe('large')
    expect(SYNCED_KEYS).not.toContain('fontSize')
  })

  it('知らない値は中として読む。以前のフォントの設定は無視して、等幅のまま', () => {
    localStorage.setItem(KEY, JSON.stringify({ fontSize: 'huge', editorFont: 'gothic' }))
    const { settings } = renderHook(() => useSettings()).result.current
    expect(settings.fontSize).toBe('medium')
    expect('editorFont' in settings).toBe(false)
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
  const touch = () =>
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)', addEventListener() {}, removeEventListener() {} }))

  it('タッチ端末はフルキー、PC は従来。選べない(端末で決まる)', () => {
    expect(activeLayout(true)).toBe('fullkey')
    expect(activeLayout(false)).toBe('classic')
  })

  it('保存された配置の設定は、読まない(前に選んでいても、端末で決まる)', () => {
    touch()
    localStorage.setItem(KEY, JSON.stringify({ layout: 'classic', digitRow: true }))
    const { settings } = renderHook(() => useSettings()).result.current
    expect('layout' in settings).toBe(false)
    expect(activeLayout(touchDevice())).toBe('fullkey')
  })

  it('数字キーの行は、初めてはオフ(スマホでも。PC の従来の配置でだけ使う)', () => {
    touch()
    expect(renderHook(() => useSettings()).result.current.settings.digitRow).toBe(false)
  })

  it('同期しない(端末ごと)', () => {
    expect(SYNCED_KEYS).not.toContain('writeRstCompact')
  })

  it('確定で RST を書くかは、PC(従来)は書き、スマホ(フルキー)は書かない', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.writeRst).toBe(true)
    expect(result.current.settings.writeRstCompact).toBe(false)
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

describe('useSettings: 時刻と運用先(フルキー)', () => {
  it('初めては出す。保存し、真偽値でなければ出すとして読む', () => {
    const first = renderHook(() => useSettings())
    expect(first.result.current.settings.showClock).toBe(true)
    act(() => first.result.current.update({ showClock: false }))
    expect(renderHook(() => useSettings()).result.current.settings.showClock).toBe(false)
    localStorage.setItem(KEY, JSON.stringify({ showClock: 'no' }))
    expect(renderHook(() => useSettings()).result.current.settings.showClock).toBe(true)
  })

  it('同期しない(端末ごと)', () => {
    expect(SYNCED_KEYS).not.toContain('showClock')
  })
})

describe('useSettings: Caps(フルキー)', () => {
  it('初めてはオフ。保存し、真偽値でなければオフとして読む', () => {
    const first = renderHook(() => useSettings())
    expect(first.result.current.settings.capsLock).toBe(false)
    act(() => first.result.current.update({ capsLock: true }))
    expect(renderHook(() => useSettings()).result.current.settings.capsLock).toBe(true)
    localStorage.setItem(KEY, JSON.stringify({ capsLock: 'yes' }))
    expect(renderHook(() => useSettings()).result.current.settings.capsLock).toBe(false)
  })

  it('同期しない(端末ごと)', () => {
    expect(SYNCED_KEYS).not.toContain('capsLock')
  })
})

describe('parseHamlogColumns: HAMLOG の欄の書式', () => {
  it('保存がなければ、既定(旧 HamLogConv と同じ)', () => {
    expect(parseHamlogColumns(undefined)).toEqual({ qth: '{rmks} {hisref}', rmks1: '{myref}', rmks2: '%{qslmsg}%{rig}' })
  })
  it('欄ごとに読み、文字列でない欄・長すぎる欄は既定', () => {
    expect(parseHamlogColumns({ qth: '{hisref}', rmks1: 3, rmks2: 'x'.repeat(101) })).toEqual({
      qth: '{hisref}',
      rmks1: '{myref}',
      rmks2: '%{qslmsg}%{rig}',
    })
  })
})
