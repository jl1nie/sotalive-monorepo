import { describe, expect, it } from 'vitest'
import type { LogView, QsoView } from './fle'
import { planTzChange, zoneLine, zoneUnset } from './tzChange'

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

describe('zoneUnset', () => {
  const at = (line: number) => ({ line, time: '09:05', tz: 0, localTime: '09:05' }) as QsoView
  const log = 'mycall JA1ABC\ndate 2026-10-25\n40m cw\n1805 ja1aaa'

  it('QSO があって、その前に timezone の行がなく、設定が UTC でなければ、知らせる', () => {
    expect(zoneUnset(log, view([at(3)]), 9)).toBe(true)
  })

  it('最初の QSO より前に timezone の行があれば(utc でも)、知らせない', () => {
    expect(zoneUnset('timezone jst\n' + log, view([at(4)]), 9)).toBe(false)
    expect(zoneUnset('timezone utc\n' + log, view([at(4)]), 9)).toBe(false)
    expect(zoneUnset('mycall JA1ABC\n  Timezone +9\n1805 ja1aaa', view([at(2)]), 9)).toBe(false)
  })

  it('全角で書いた timezone の行も、行として数える', () => {
    expect(zoneUnset('ｔｉｍｅｚｏｎｅ ｊｓｔ\n' + log, view([at(4)]), 9)).toBe(false)
  })

  it('設定が UTC・QSO がない・timezone が最初の QSO よりあとにあるだけ、のとき', () => {
    expect(zoneUnset(log, view([at(3)]), 0)).toBe(false)
    expect(zoneUnset(log, view([]), 9)).toBe(false)
    // 最初の QSO は UTC の意味で読まれている。知らせる
    expect(zoneUnset(log + '\ntimezone jst\n1900 ja1bbb', view([at(3), at(5)]), 9)).toBe(true)
  })
})

describe('zoneLine', () => {
  it('読み込んだログの先頭に足す、時間帯の行', () => {
    expect(zoneLine(9)).toBe('timezone +9\n')
    expect(zoneLine(-5)).toBe('timezone -5\n')
    expect(zoneLine(0)).toBe('timezone utc\n')
  })
})
