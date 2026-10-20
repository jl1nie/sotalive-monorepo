// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { FullKeyboard } from './FullKeyboard'

afterEach(cleanup)

const CONFIRM = 'この行を確定して次の行へ'
const NEXT = '改行して次の行へ'

function renderKeys(props: Partial<Parameters<typeof FullKeyboard>[0]> = {}) {
  const handlers = {
    onKey: vi.fn(),
    onMove: vi.fn(),
    onBackspace: vi.fn(),
    onConfirm: vi.fn(),
    onNewline: vi.fn(),
    onOsKeyboard: vi.fn(),
    onUndo: vi.fn(),
    onKeyScale: vi.fn(),
  }
  render(<FullKeyboard confirmable={false} keyScale={1} {...handlers} {...props} />)
  return handlers
}

describe('FullKeyboard', () => {
  it('数字・QWERTY の3段(- は L の右、/ は M の右)・下の段を、この順に出す', () => {
    renderKeys()
    const keys = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(keys).toEqual([
      ...'1234567890qwertyuiopasdfghjkl'.split(''),
      '-,',
      ...'zxcvbnm'.split(''),
      '/.',
      '1文字消す',
      'OS のキーボードに切り替える(日本語など)',
      '取り消す(直前の編集を元に戻す)',
      'カーソルを左へ',
      '空白',
      'カーソルを右へ',
      NEXT,
    ])
  })

  it('- を続けて2回押すと、, になる(1回目の - を , に置き換える)。間が空けば - のまま', () => {
    vi.useFakeTimers()
    try {
      const { onKey, onBackspace } = renderKeys()
      const dash = screen.getByRole('button', { name: '-' })
      fireEvent.click(dash)
      vi.advanceTimersByTime(200)
      fireEvent.click(dash)
      expect(onKey.mock.calls).toEqual([['-'], [',', true]])
      vi.advanceTimersByTime(2000)
      fireEvent.click(dash)
      vi.advanceTimersByTime(600)
      fireEvent.click(dash)
      expect(onKey.mock.calls.slice(2)).toEqual([['-'], ['-']])
      expect(onBackspace).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('/ を続けて2回押すと、. になる(周波数 7.0295 など)。間が空けば / のまま', () => {
    vi.useFakeTimers()
    try {
      const { onKey } = renderKeys()
      const slash = screen.getByRole('button', { name: '/' })
      fireEvent.click(slash)
      vi.advanceTimersByTime(200)
      fireEvent.click(slash)
      expect(onKey.mock.calls).toEqual([['/'], ['.', true]])
      vi.advanceTimersByTime(2000)
      fireEvent.click(slash)
      vi.advanceTimersByTime(600)
      fireEvent.click(slash)
      expect(onKey.mock.calls.slice(2)).toEqual([['/'], ['/']])
    } finally {
      vi.useRealTimers()
    }
  })

  it('- のあとに / を押しても、. にはならない(続けて2回は、同じキーだけ)', () => {
    const { onKey } = renderKeys()
    fireEvent.click(screen.getByRole('button', { name: '-' }))
    fireEvent.click(screen.getByRole('button', { name: '/' }))
    expect(onKey.mock.calls).toEqual([['-'], ['/']])
  })

  it('空白は、6列(キー3つ分)の幅', () => {
    renderKeys()
    expect(screen.getByRole('button', { name: '空白' })).toHaveClass('col-span-6')
  })

  it('↶ で、直前の編集を取り消す', () => {
    const { onUndo, onKey } = renderKeys()
    fireEvent.click(screen.getByRole('button', { name: '取り消す(直前の編集を元に戻す)' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onKey).not.toHaveBeenCalled()
  })

  it('英字は小文字で、空白は半角で打つ', () => {
    const { onKey } = renderKeys()
    fireEvent.click(screen.getByRole('button', { name: 'j' }))
    fireEvent.click(screen.getByRole('button', { name: '空白' }))
    fireEvent.click(screen.getByRole('button', { name: '7' }))
    expect(onKey.mock.calls).toEqual([['j'], [' '], ['7']])
  })

  it('右下は、確定できる行なら確定、ほかは次の行', () => {
    const first = renderKeys({ confirmable: true })
    expect(screen.queryByRole('button', { name: NEXT })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: CONFIRM }))
    expect(first.onConfirm).toHaveBeenCalledTimes(1)
    cleanup()
    const second = renderKeys({ confirmable: false })
    fireEvent.click(screen.getByRole('button', { name: NEXT }))
    expect(second.onNewline).toHaveBeenCalledTimes(1)
    expect(second.onConfirm).not.toHaveBeenCalled()
  })

  it('🌐 で OS のキーボードへ。← → と ⌫ も打てる', () => {
    const { onOsKeyboard, onMove, onBackspace } = renderKeys()
    fireEvent.click(screen.getByRole('button', { name: 'OS のキーボードに切り替える(日本語など)' }))
    fireEvent.click(screen.getByRole('button', { name: 'カーソルを左へ' }))
    const bs = screen.getByRole('button', { name: '1文字消す' })
    fireEvent.pointerDown(bs, { clientX: 100 })
    fireEvent.pointerUp(bs, { clientX: 100 })
    fireEvent.click(bs)
    expect(onOsKeyboard).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith(-1)
    expect(onBackspace).toHaveBeenCalledTimes(1)
  })

  it('文字のキーは、指が横に滑っても、なぞりにせず、その文字を打つ', () => {
    const { onKey, onMove } = renderKeys()
    const q = screen.getByRole('button', { name: 'q' })
    fireEvent.pointerDown(q, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(q, { clientX: 145, pointerId: 1 })
    fireEvent.pointerUp(q, { clientX: 145, pointerId: 1 })
    fireEvent.click(q)
    expect(onMove).not.toHaveBeenCalled()
    expect(onKey).toHaveBeenCalledWith('q')
  })

  it('空白から左右になぞると、空白は入らず、カーソルが動く', () => {
    const { onKey, onMove } = renderKeys()
    const space = screen.getByRole('button', { name: '空白' })
    fireEvent.pointerDown(space, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(space, { clientX: 145, pointerId: 1 })
    fireEvent.pointerUp(space, { clientX: 145, pointerId: 1 })
    fireEvent.click(space)
    expect(onMove.mock.calls).toEqual([[2]])
    expect(onKey).not.toHaveBeenCalled()
  })

  it('別の指の動きは、なぞりにしない(親指2本で交互に打つ)', () => {
    const { onKey, onMove } = renderKeys()
    const space = screen.getByRole('button', { name: '空白' })
    const j = screen.getByRole('button', { name: 'j' })
    fireEvent.pointerDown(space, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(j, { clientX: 160, pointerId: 2 })
    fireEvent.pointerUp(space, { clientX: 100, pointerId: 1 })
    fireEvent.click(space)
    expect(onMove).not.toHaveBeenCalled()
    expect(onKey).toHaveBeenCalledWith(' ')
  })

  it('押している間、文字の吹き出しを出し、離すと消す', () => {
    renderKeys()
    const k = screen.getByRole('button', { name: 'k' })
    fireEvent.pointerDown(k, { clientX: 100, pointerId: 1 })
    expect(k.querySelectorAll('span')).toHaveLength(2)
    fireEvent.pointerUp(k, { clientX: 100, pointerId: 1 })
    expect(k.querySelectorAll('span')).toHaveLength(1)
  })

  it('上の縁のつまみを上へ引くと、キーが高くなる(正方形から 1.5 倍まで)。離したときに保存する', () => {
    const { onKeyScale } = renderKeys()
    // 正方形のキーボード(5段)の高さを 185px とする
    Object.defineProperty(screen.getByRole('group'), 'offsetHeight', { configurable: true, value: 185 })
    const handle = screen.getByRole('separator')
    fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 454, pointerId: 1 })
    expect(onKeyScale).not.toHaveBeenCalled()
    fireEvent.pointerUp(handle, { clientY: 454, pointerId: 1 })
    expect(onKeyScale).toHaveBeenCalledWith(1.25)
    // 引きすぎても 1.5 倍まで、下げすぎても正方形まで
    fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 0, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientY: 0, pointerId: 1 })
    fireEvent.pointerDown(handle, { clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 900, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientY: 900, pointerId: 1 })
    expect(onKeyScale.mock.calls.slice(1)).toEqual([[1.5], [1]])
  })
})
