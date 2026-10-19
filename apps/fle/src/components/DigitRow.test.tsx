// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { DigitRow } from './DigitRow'

afterEach(cleanup)

describe('DigitRow', () => {
  it('0〜9 と / と - を、この順に出す', () => {
    render(<DigitRow onKey={() => {}} />)
    const keys = screen.getAllByRole('button').map((b) => b.textContent)
    expect(keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '/', '-'])
  })

  it('マイナスを押すと、半角の - を打つ(JA-1151 や -18 のため)', () => {
    const onKey = vi.fn()
    render(<DigitRow onKey={onKey} />)
    fireEvent.click(screen.getByRole('button', { name: '-' }))
    expect(onKey).toHaveBeenCalledWith('-')
  })
})

describe('DigitRow: なぞる', () => {
  it('左右になぞると、数字は入らず、20px ごとに1文字カーソルが動く', () => {
    const onKey = vi.fn()
    const onMove = vi.fn()
    render(<DigitRow onKey={onKey} onMove={onMove} />)
    const row = screen.getByRole('group')
    const five = screen.getByRole('button', { name: '5' })
    fireEvent.pointerDown(five, { clientX: 100 })
    fireEvent.pointerMove(five, { clientX: 108 })
    expect(onMove).not.toHaveBeenCalled()
    fireEvent.pointerMove(row, { clientX: 125 })
    fireEvent.pointerMove(row, { clientX: 150 })
    fireEvent.pointerMove(row, { clientX: 70 })
    fireEvent.pointerUp(row, { clientX: 70 })
    fireEvent.click(five)
    expect(onMove.mock.calls).toEqual([[1], [1], [-3]])
    expect(onKey).not.toHaveBeenCalled()
  })

  it('少し動いただけ(10px 未満)なら、数字を入れる', () => {
    const onKey = vi.fn()
    const onMove = vi.fn()
    render(<DigitRow onKey={onKey} onMove={onMove} />)
    const five = screen.getByRole('button', { name: '5' })
    fireEvent.pointerDown(five, { clientX: 100 })
    fireEvent.pointerMove(five, { clientX: 106 })
    fireEvent.pointerUp(five, { clientX: 106 })
    fireEvent.click(five)
    expect(onKey).toHaveBeenCalledWith('5')
    expect(onMove).not.toHaveBeenCalled()
  })
})
