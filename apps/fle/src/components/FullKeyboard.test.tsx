// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { FullKeyboard } from './FullKeyboard'

afterEach(cleanup)

const NEXT = '改行して、下に行を足す'

function renderKeys(props: Partial<Parameters<typeof FullKeyboard>[0]> = {}) {
  const handlers = {
    onKey: vi.fn(),
    onMove: vi.fn(),
    onBackspace: vi.fn(),
    onNewline: vi.fn(),
    onOsKeyboard: vi.fn(),
    onUndo: vi.fn(),
    onKeyScale: vi.fn(),
    onToggleCaps: vi.fn(),
  }
  render(<FullKeyboard keyScale={1} caps={false} {...handlers} {...props} />)
  return handlers
}

describe('FullKeyboard', () => {
  it('数字・QWERTY の3段(- は L の右、/ は M の右)・下の段を、この順に出す', () => {
    renderKeys()
    const keys = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(keys).toEqual([
      ...'1234567890qwertyuiopasdfghjkl'.split(''),
      '-,',
      '英字を大文字で打つ(Caps)',
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

  it('Z の左の Caps: オフでは中抜きの矢印、押すと切り替える', () => {
    const { onToggleCaps } = renderKeys()
    const caps = screen.getByRole('button', { name: '英字を大文字で打つ(Caps)' })
    expect(caps.querySelector('svg')).toHaveAttribute('fill', 'none')
    expect(caps).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(caps)
    expect(onToggleCaps).toHaveBeenCalledTimes(1)
  })

  it('Caps がオンなら、英字を大文字で打ち、矢印を塗りつぶす。数字と記号はそのまま', () => {
    const { onKey } = renderKeys({ caps: true })
    const caps = screen.getByRole('button', { name: '英字を大文字で打つ(Caps)' })
    expect(caps.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
    expect(caps).toHaveAttribute('aria-pressed', 'true')
    for (const k of ['j', 'a', '1', '/', '-']) fireEvent.click(screen.getByRole('button', { name: k }))
    fireEvent.click(screen.getByRole('button', { name: '空白' }))
    expect(onKey.mock.calls.map((c) => c[0])).toEqual(['J', 'A', '1', '/', '-', ' '])
  })

  it('英字のキーの文字は、入る文字に合わせる(Caps オフは小文字、オンは大文字)', () => {
    const letter = () => screen.getByRole('button', { name: 'q' }).querySelector('span')!
    renderKeys()
    expect(letter()).not.toHaveClass('uppercase')
    cleanup()
    renderKeys({ caps: true })
    expect(letter()).toHaveClass('uppercase')
  })

  it('Caps と ⌫ は、どちらもキー1つ分(2列)の幅', () => {
    renderKeys()
    expect(screen.getByRole('button', { name: '英字を大文字で打つ(Caps)' })).toHaveClass('col-span-2')
    expect(screen.getByRole('button', { name: '1文字消す' })).toHaveClass('col-span-2')
  })

  it('空白は8列(キー4つ分)、右下の次の行は4列(キー2つ分)の幅', () => {
    renderKeys()
    expect(screen.getByRole('button', { name: '空白' })).toHaveClass('col-span-8')
    expect(screen.getByRole('button', { name: NEXT })).toHaveClass('col-span-4')
  })

  it('続けて2回押したときの , と . は、キーの右下に小さく出す(右上の , は \' に見える)', () => {
    renderKeys()
    for (const [k, alt] of [['-', ','], ['/', '.']]) {
      const hint = screen.getByRole('button', { name: k }).querySelector('small')!
      expect(hint).toHaveTextContent(alt)
      expect(hint).toHaveClass('bottom-0.5')
      expect(hint).not.toHaveClass('top-0')
    }
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

  it('右下は、いつも改行して下に行を足す(次の行へ進むのは、緑のバーの右端の OK)', () => {
    const { onNewline } = renderKeys()
    expect(screen.queryByRole('button', { name: 'この行を終えて次の行へ(OK)' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: NEXT }))
    expect(onNewline).toHaveBeenCalledTimes(1)
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
