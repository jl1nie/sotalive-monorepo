// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { DigitRow } from './DigitRow'

afterEach(cleanup)

describe('DigitRow', () => {
  it('従来の配置では、0〜9 と / と - を、この順に出す', () => {
    render(<DigitRow onKey={() => {}} />)
    const keys = screen.getAllByRole('button').map((b) => b.textContent)
    expect(keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '/', '-'])
  })

  it('コンパクトな配置では、1段目に 0〜9、2段目に / - ← → 空白 ⌫ を、この順に出す', () => {
    render(<DigitRow onKey={() => {}} compact />)
    const keys = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(keys).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '/', '-', 'カーソルを左へ', 'カーソルを右へ', '空白', '1文字消す'])
  })

  it('空白を押すと、半角の空白を打つ', () => {
    const onKey = vi.fn()
    render(<DigitRow onKey={onKey} compact />)
    fireEvent.click(screen.getByRole('button', { name: '空白' }))
    expect(onKey).toHaveBeenCalledWith(' ')
  })

  it('← → は、カーソルを1文字ずつ動かす', () => {
    const onMove = vi.fn()
    render(<DigitRow onKey={() => {}} onMove={onMove} compact />)
    fireEvent.click(screen.getByRole('button', { name: 'カーソルを左へ' }))
    fireEvent.click(screen.getByRole('button', { name: 'カーソルを右へ' }))
    expect(onMove.mock.calls).toEqual([[-1], [1]])
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

describe('DigitRow: ⌫', () => {
  afterEach(() => vi.useRealTimers())

  it('押すと、1文字消す', () => {
    const onBackspace = vi.fn()
    render(<DigitRow onKey={() => {}} onBackspace={onBackspace} compact />)
    const bs = screen.getByRole('button', { name: '1文字消す' })
    fireEvent.pointerDown(bs, { clientX: 100 })
    fireEvent.pointerUp(bs, { clientX: 100 })
    fireEvent.click(bs)
    expect(onBackspace).toHaveBeenCalledTimes(1)
  })

  it('押し続けると、続けて消す(離したあとの click では、もう消さない)', () => {
    vi.useFakeTimers()
    const onBackspace = vi.fn()
    render(<DigitRow onKey={() => {}} onBackspace={onBackspace} compact />)
    const bs = screen.getByRole('button', { name: '1文字消す' })
    fireEvent.pointerDown(bs, { clientX: 100 })
    vi.advanceTimersByTime(399)
    expect(onBackspace).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1 + 70 * 2)
    expect(onBackspace).toHaveBeenCalledTimes(3)
    fireEvent.pointerUp(bs, { clientX: 100 })
    fireEvent.click(bs)
    vi.advanceTimersByTime(1000)
    expect(onBackspace).toHaveBeenCalledTimes(3)
  })

  it('⌫ から左右になぞると、消さずにカーソルを動かす', () => {
    vi.useFakeTimers()
    const onBackspace = vi.fn()
    const onMove = vi.fn()
    render(<DigitRow onKey={() => {}} onMove={onMove} onBackspace={onBackspace} compact />)
    const bs = screen.getByRole('button', { name: '1文字消す' })
    fireEvent.pointerDown(bs, { clientX: 100 })
    fireEvent.pointerMove(bs, { clientX: 60 })
    vi.advanceTimersByTime(1000)
    fireEvent.pointerUp(bs, { clientX: 60 })
    fireEvent.click(bs)
    expect(onMove.mock.calls).toEqual([[-2]])
    expect(onBackspace).not.toHaveBeenCalled()
  })
})
