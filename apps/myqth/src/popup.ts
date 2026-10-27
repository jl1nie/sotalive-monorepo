import { escapeHTML, type GeoResult } from '@sotalive/geo'

export interface PopupContext {
  /** 表示用に 6 桁に丸めた座標 */
  lat: number
  lng: number
  /** 地理院地図へのリンクに使う、丸めていない座標 */
  rawLat: number
  rawLng: number
  /** 現在地(GPS)か。そうでなければ、位置の行を斜体にする */
  isGPS: boolean
  /** 現在地のマーカーのポップアップか(見出しにし、標高の出典は出さない) */
  isMarker: boolean
}

const GSI_MAP = 'https://maps.gsi.go.jp/#15/'

/** 6 桁に丸める(旧版と同じ) */
export const round6 = (v: number) => Math.round(v * 1000000) / 1000000

/** 逆ジオコーダーの結果を、ポップアップの HTML にする。文言と構造は、旧版の `resfun` と同じ */
export function popupHtml(res: GeoResult, ctx: PopupContext): string {
  const { lat, lng, isGPS, isMarker } = ctx
  let mesg: string
  let accu = ''
  if (res.kind === 'outside') {
    mesg = `Pos: ${lat},${lng}<br>GL: ${escapeHTML(res.maidenhead)}`
  } else if (res.kind === 'error') {
    mesg = `住所を取得できませんでした<br>GL: ${escapeHTML(res.maidenhead)}`
  } else {
    if (res.hsrc) accu = `<small>[${escapeHTML(res.hsrc.replace('（', '').replace('）', ''))}]</small>`
    const link = `<a href="${GSI_MAP}${ctx.rawLat}/${ctx.rawLng}" target="_blank">${lat},${lng}</a>`
    const pos = isGPS ? `<br>位置:${link}` : `<i><br>位置:${link}</i>`
    const tail = `<br>GL:${escapeHTML(res.maidenhead)}${pos}<br> 標高:${escapeHTML(res.elevation)}m`
    if (res.jccCode != null) {
      const ward = res.wardCode != null ? ` 区番号:${escapeHTML(res.wardCode)}` : ''
      mesg = `JCC${escapeHTML(res.jccCode)}${ward}<br>${escapeHTML(res.prefecture)}${escapeHTML(res.municipality)}${tail}`
    } else {
      mesg =
        `JCG${escapeHTML(res.jcgCode ?? '')}${escapeHTML(res.hamlogCode ?? '')}<br>` +
        `${escapeHTML(res.prefecture)}${escapeHTML(res.jcgText ?? '')}${escapeHTML(res.municipality)}${tail}`
    }
  }
  return isMarker ? `<h4>${mesg}</h4>` : mesg + accu
}
