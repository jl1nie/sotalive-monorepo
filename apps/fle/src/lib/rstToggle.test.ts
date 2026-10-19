import { describe, expect, it } from 'vitest'
import { nextRst } from './rstToggle'

const text = '1005 ja1xyz 57 599'

describe('nextRst', () => {
  it('初めては受信。受信へ移した直後にもう一度押すと送信、その次はまた受信', () => {
    expect(nextRst(null, text, 6)).toBe('rstRcvd')
    expect(nextRst({ part: 'rstRcvd', text, caret: 18 }, text, 18)).toBe('rstSent')
    expect(nextRst({ part: 'rstSent', text, caret: 14 }, text, 14)).toBe('rstRcvd')
  })

  it('間にキャレットが動いたり、打ったりしていれば、受信から', () => {
    // 受信へ移したあと、コールを押した(キャレットが動いた)
    expect(nextRst({ part: 'rstRcvd', text, caret: 18 }, text, 11)).toBe('rstRcvd')
    // 受信へ移したあと、打ち直した
    expect(nextRst({ part: 'rstRcvd', text, caret: 18 }, '1005 ja1xyz 57 579', 18)).toBe('rstRcvd')
  })
})
