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
  }
  render(<FullKeyboard confirmable={false} {...handlers} {...props} />)
  return handlers
}

describe('FullKeyboard', () => {
  it('数字・QWERTY の3段・/ ⌫・下の段を、この順に出す', () => {
    renderKeys()
    const keys = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(keys).toEqual([
      ...'1234567890qwertyuiopasdfghjkl'.split(''),
      '/',
      ...'zxcvbnm'.split(''),
      '1文字消す',
      'OS のキーボードに切り替える(日本語など)',
      '-',
      'カーソルを左へ',
      '空白',
      'カーソルを右へ',
      NEXT,
    ])
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

  it('どこからでも左右になぞると、キーは入らず、カーソルが動く', () => {
    const { onKey, onMove } = renderKeys()
    const q = screen.getByRole('button', { name: 'q' })
    fireEvent.pointerDown(q, { clientX: 100 })
    fireEvent.pointerMove(q, { clientX: 145 })
    fireEvent.pointerUp(q, { clientX: 145 })
    fireEvent.click(q)
    expect(onMove.mock.calls).toEqual([[2]])
    expect(onKey).not.toHaveBeenCalled()
  })
})
