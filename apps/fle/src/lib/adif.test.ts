import { describe, expect, it } from 'vitest'
import { adif2fle } from './adif'

describe('adif2fle', () => {
  const adif =
    '<CALL:6>JA1XYZ<QSO_DATE:8>20241228<TIME_ON:4>1234<MODE:2>CW<BAND:3>40m<RST_SENT:3>599<RST_RCVD:3>579<EOR>' +
    '<CALL:6>JA1QSO<QSO_DATE:8>20241228<TIME_ON:4>1240<MODE:2>CW<BAND:3>40m<EOR>'

  it('日付・バンド/モードは変わったときだけ出す', () => {
    const lines = adif2fle(adif).split('\r\n').filter(Boolean)
    expect(lines).toEqual(['date 2024-12-28', '40m CW', '1234 JA1XYZ 599 579', '1240 JA1QSO 599 599'])
  })

  it('空白や改行を挟む通常のADIFも読める', () => {
    const spaced = '<CALL:6>JA1XYZ <QSO_DATE:8>20241228 <TIME_ON:6>123456 <MODE:3>SSB <BAND:3>20m <EOR>\n'
    expect(adif2fle(spaced).split('\r\n').filter(Boolean)).toEqual([
      'date 2024-12-28',
      '20m SSB',
      '1234 JA1XYZ 599 599',
    ])
  })

  it('値に「<」を含むコメントがあっても、長さで読み進める', () => {
    const rec = '<COMMENT:5>a<b>c<CALL:6>JA1XYZ<QSO_DATE:8>20241228<TIME_ON:4>0900<EOR>'
    expect(adif2fle(rec)).toContain('0900 JA1XYZ')
  })

  it('コールサインのないレコードは読み飛ばす', () => {
    expect(adif2fle('<QSO_DATE:8>20241228<TIME_ON:4>1234<EOR>')).toBe('')
  })
})
