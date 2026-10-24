// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { StationFields } from './StationFields'

afterEach(cleanup)

const values = { mycall: '', sota: '', pota: '', wwff: '', grid: '' }

describe('StationFields', () => {
  it('山・公園の欄は大文字を強いない(iPhone のローマ字入力で、山名をかな・漢字にできるように)', () => {
    const { container } = render(<StationFields values={values} onChange={() => {}} errors={[]} />)
    const cap = (id: string) => container.querySelector(`#place-${id}`)?.getAttribute('autocapitalize')
    expect(cap('sota')).toBe('none')
    expect(cap('pota')).toBe('none')
    // コールサイン・WWFF・グリッドは、大文字で打つ
    expect(cap('mycall')).toBe('characters')
    expect(cap('wwff')).toBe('characters')
    expect(cap('grid')).toBe('characters')
  })
})
