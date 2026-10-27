import { describe, expect, it } from 'vitest'
import { MESSAGES, errorMessage, waitingMessage } from './locate-status.ts'

describe('waitingMessage(許可の状態から、取得中の文言)', () => {
  it('許可が拒否されているときは、すぐに設定の案内を出す(待たせない)', () => {
    expect(waitingMessage('denied')).toBe(MESSAGES.denied)
    expect(MESSAGES.denied).toContain('設定')
  })
  it('許可の確認が出る(prompt)ときは、「許可」を選ぶように言う', () => {
    expect(waitingMessage('prompt')).toContain('「許可」')
  })
  it('許可済み・不明は、取得中とだけ出す', () => {
    expect(waitingMessage('granted')).toBe(MESSAGES.waiting)
    expect(waitingMessage('unknown')).toBe(MESSAGES.waiting)
  })
})

describe('errorMessage(失敗の理由ごとの案内)', () => {
  it('1 は許可なし(設定の案内)、2 は位置不明、3 はタイムアウト、それ以外は一般の文言', () => {
    expect(errorMessage(1)).toBe(MESSAGES.denied)
    expect(errorMessage(2)).toBe(MESSAGES.unavailable)
    expect(errorMessage(3)).toBe(MESSAGES.timeout)
    expect(errorMessage(0)).toBe(MESSAGES.other)
  })
  it('どの案内も、もう一度「QTH」を押す方法か、設定の場所を言う', () => {
    for (const code of [1, 2, 3, 99]) expect(errorMessage(code)).toMatch(/QTH|設定/)
  })
})
