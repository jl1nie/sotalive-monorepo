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
