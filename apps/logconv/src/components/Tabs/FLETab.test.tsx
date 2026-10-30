import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FLETab } from './FLETab'
import { TabContainer } from './TabContainer'

afterEach(() => {
  cleanup()
  location.hash = ''
})

describe('FLE Online の案内', () => {
  it('移転先の FLE Online へのリンクがある', () => {
    render(<FLETab />)
    expect(screen.getByRole('link', { name: /FLE Online を開く/ }).getAttribute('href')).toBe(
      'https://fleonline.sotalive.net/fle/'
    )
  })

  it('タブから開ける', () => {
    render(<TabContainer>{(id) => <p>{id}</p>}</TabContainer>)
    fireEvent.click(screen.getAllByRole('button', { name: /FLE/ })[0])
    expect(screen.getByText('fle')).toBeTruthy()
  })

  it('旧版のリンク(#FLEOnline)では、このタブが開く', () => {
    location.hash = '#FLEOnline'
    render(<TabContainer>{(id) => <p>{id}</p>}</TabContainer>)
    expect(screen.getByText('fle')).toBeTruthy()
  })
})
