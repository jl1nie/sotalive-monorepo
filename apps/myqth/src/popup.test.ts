import { describe, expect, it } from 'vitest'
import type { GeoOk } from '@sotalive/geo'
import { popupHtml, round6, type PopupContext } from './popup.ts'

const CTX: PopupContext = {
  lat: 35.681236,
  lng: 139.767125,
  rawLat: 35.6812361,
  rawLng: 139.7671251,
  isGPS: false,
  isMarker: false,
}
const LINK =
  '<a href="https://maps.gsi.go.jp/#15/35.6812361/139.7671251" target="_blank">35.681236,139.767125</a>'

const JCC: GeoOk = {
  kind: 'ok',
  jccCode: '100101',
  wardCode: null,
  jcgCode: null,
  hamlogCode: null,
  jcgText: null,
  prefecture: '東京都',
  municipality: '千代田区丸の内一丁目',
  maidenhead: 'PM95vq',
  elevation: 3.2,
  hsrc: '（5m（レーザ））',
}

describe('popupHtml(旧版の resfun と同じ文言・構造)', () => {
  it('JCC: 地図のクリック(位置の行は斜体、標高の出典は末尾)', () => {
    expect(popupHtml(JCC, CTX)).toBe(
      `JCC100101<br>東京都千代田区丸の内一丁目<br>GL:PM95vq<i><br>位置:${LINK}</i><br> 標高:3.2m<small>[5m（レーザ）]</small>`,
    )
  })

  it('JCC に区番号があれば足す。現在地(GPS)の位置の行は斜体にしない', () => {
    const html = popupHtml({ ...JCC, wardCode: '03' }, { ...CTX, isGPS: true })
    expect(html).toContain('JCC100101 区番号:03<br>')
    expect(html).toContain(`<br>位置:${LINK}<br>`)
    expect(html).not.toContain('<i>')
  })

  it('JCC がなければ JCG(コード・ハムログ・市郡名・市区町村)', () => {
    const html = popupHtml(
      { ...JCC, jccCode: null, jcgCode: '1201', hamlogCode: 'A', jcgText: '大島支庁', municipality: '大島町' },
      CTX,
    )
    expect(html).toContain('JCG1201A<br>東京都大島支庁大島町<br>GL:PM95vq')
  })

  it('現在地のマーカー: 見出しにして、標高の出典は出さない', () => {
    const html = popupHtml(JCC, { ...CTX, isMarker: true, isGPS: true })
    expect(html.startsWith('<h4>JCC100101')).toBe(true)
    expect(html.endsWith('</h4>')).toBe(true)
    expect(html).not.toContain('<small>')
  })

  it('標高の出典(hsrc)がなくても、例外にならない', () => {
    const html = popupHtml({ ...JCC, hsrc: undefined }, CTX)
    expect(html).toContain('標高:3.2m')
    expect(html).not.toContain('<small>')
  })

  it('日本の外: 座標とグリッドロケーター', () => {
    expect(popupHtml({ kind: 'outside', maidenhead: 'QM05aa' }, CTX)).toBe(
      'Pos: 35.681236,139.767125<br>GL: QM05aa',
    )
  })

  it('取得の失敗は、圏外と別の文言', () => {
    const html = popupHtml({ kind: 'error', maidenhead: 'PM95vq99' }, CTX)
    expect(html).toContain('住所を取得できませんでした')
    expect(html).toContain('GL: PM95vq99')
    expect(html).not.toContain('Pos:')
  })

  it('外から来た値は HTML として解釈しない', () => {
    const html = popupHtml({ ...JCC, municipality: '<img src=x onerror=alert(1)>' }, CTX)
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('round6', () => {
  it('小数 6 桁に丸める', () => {
    expect(round6(35.68123649)).toBe(35.681236)
    expect(round6(139.7671251)).toBe(139.767125)
  })
})
