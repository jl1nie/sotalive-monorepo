import { describe, expect, it } from 'vitest'
import type { LogView, QsoView } from './fle'
import { planTzChange } from './tzChange'

const qso = (time: string, tz: number, localTime: string) => ({ time, tz, localTime }) as QsoView
const view = (qsos: QsoView[]) => ({ qsos }) as LogView

describe('planTzChange', () => {
  it('QSO がなければ、timezone の行を書き直すだけ(空のログは何もしない)', () => {
    expect(planTzChange('mycall JA1ABC', view([]), 9)).toEqual({ kind: 'rewrite' })
    expect(planTzChange('  \n', view([]), 9)).toEqual({ kind: 'none' })
  })

  it('QSO がもうその時間帯で書かれていれば、ログは変えない', () => {
    expect(planTzChange('…', view([qso('09:05', 9, '18:05')]), 9)).toEqual({ kind: 'none' })
  })

  it('違えば、最初の QSO の時刻を例にして確かめる', () => {
    const v = view([qso('09:05', 0, '09:05'), qso('09:10', 0, '09:10')])
    expect(planTzChange('…', v, 9)).toEqual({ kind: 'ask', from: '09:05', to: '18:05', qsos: 2 })
  })

  it('変換した時刻は、0 時をまたいで回る', () => {
    expect(planTzChange('…', view([qso('15:30', 9, '00:30')]), 0)).toMatchObject({ from: '00:30', to: '15:30' })
    expect(planTzChange('…', view([qso('02:00', 0, '02:00')]), -5)).toMatchObject({ to: '21:00' })
  })
})
