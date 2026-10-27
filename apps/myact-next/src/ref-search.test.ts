import { describe, expect, it } from 'vitest'
import { isSummitCode, matchCandidate, optionValue, parseCoords } from './ref-search.ts'

const c = { code: 'JP-0118', name: 'Tanzawa', nameJ: '丹沢大山国定公園', lat: 35.4105, lon: 139.2098 }

describe('parseCoords', () => {
  it('小数の「緯度,経度」', () => expect(parseCoords('35.410500,139.209800')).toEqual([35.4105, 139.2098]))
  it('短い・小数でない・範囲外は null', () => {
    expect(parseCoords('35.4,139.2')).toBeNull()
    expect(parseCoords('35,139,35,139,35,139')).toBeNull()
    expect(parseCoords('135.410500,139.209800')).toBeNull()
  })
})
describe('matchCandidate', () => {
  it('最初の語が、コードと同じ(大文字小文字を問わない)', () => {
    expect(matchCandidate('jp-0118 丹沢大山国定公園', [c])).toEqual({ code: 'JP-0118', name: '丹沢大山国定公園', coord: [35.4105, 139.2098] })
  })
  it('なければ null', () => expect(matchCandidate('JP-0', [c])).toBeNull())
})
describe('optionValue・isSummitCode', () => {
  it('" を打っていれば、名前を囲む', () => {
    expect(optionValue(c, '丹沢')).toBe('JP-0118 丹沢大山国定公園')
    expect(optionValue(c, '"丹沢')).toBe('JP-0118 "丹沢大山国定公園"')
  })
  it('SOTA のコードだけ', () => {
    expect(isSummitCode('JA/KN-006')).toBe(true)
    expect(isSummitCode('JA1/TK-001')).toBe(true)
    expect(isSummitCode('JP-0118')).toBe(false)
  })
})
