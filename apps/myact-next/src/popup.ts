/**
 * 地図の空白をクリックしたときのポップアップ(旧版 `displayPopup`。docs/myact-next-design.md の 6.2 の B1・B2・B4・B5)。
 * 旧版の golden master(packages/myact-golden/expected)と、同じ行・同じ順序・同じ文言。
 * HTML の文字列は組み立てない: 外から来る値(山の名前・住所など)は、すべて textContent で入れる(旧版は、一部が未エスケープだった)。
 */
import type { GeoResult } from '@sotalive/geo'
import { h, type Child } from './dom.ts'
import type { SotaSummit } from './api.ts'

export interface PopupInput {
  /** クリックした位置(丸めていない) */
  lat: number
  lng: number
  zoom: number
  /** 現在地(GPS)か。位置の行を、斜体にしない */
  isGPS: boolean
  geo: GeoResult
  /** 半径 200m 以内のサミット(最初の 1 つ) */
  summit: SotaSummit | null
}

const round6 = (v: number) => Math.round(v * 1000000) / 1000000
/** 東経 → 西経(180° をまたぐ地図。旧版 toWestLon) */
const toWestLon = (lon: number) => (lon > 180 ? lon - 360 : lon)

export const gsiUrl = (lat: number, lng: number, zoom: number) => `https://maps.gsi.go.jp/#${zoom}/${lat}/${lng}`
export const windyUrl = (lat: number, lng: number, zoom: number) =>
  `https://www.windy.com/${lat}/${lng}/meteogram?rain,${lat},${lng},${Math.min(zoom, 11)}`
const sotaUrl = (code: string) => `https://summits.sota.org.uk/summit/${encodeURIComponent(code)}`

/** 外部へのリンク(新しいタブ。旧版にない rel=noopener を付ける) */
const ext = (href: string, ...children: Child[]) => h('a', { href, target: '_blank', rel: 'noopener' }, ...children)

/** 行ごとに <br> でつなぐ(旧版と同じ構造。innerText が、旧版と同じ行になる) */
function lines(...parts: Child[][]): Node[] {
  const out: Node[] = []
  parts.forEach((p, i) => {
    if (i > 0) out.push(h('br'))
    out.push(...(p.filter((c) => c !== null && c !== false && c !== undefined) as Node[]).map((c) => (typeof c === 'string' ? document.createTextNode(c) : c)))
  })
  return out
}

/** 天気(Windy)のリンク。旧版は、太陽・雲・雨の画像 3 枚(文字なし)。 */
function weatherLink(lat: number, lng: number, zoom: number) {
  const icon = (d: string) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="${d}"/></svg>`
  const a = h('a', { href: windyUrl(lat, lng, zoom), target: '_blank', rel: 'noopener', class: 'weather', 'aria-label': '天気(Windy)' })
  a.innerHTML = icon('M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3') + icon('M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.500 3.500 0 0 0 1 7z') + icon('M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 7a3.500 3.500 0 0 0 1 7zM8 18l-1 3M12 18l-1 3M16 18l-1 3')
  return h('span', { class: 'weather-wrap' }, '  ', a)
}

/** B4: 位置の情報(JCC/JCG・住所・GL・位置・標高)。日本の外は Pos と GL だけ。失敗は、理由 */
function locationBlock(input: PopupInput): Node[] {
  const { geo, isGPS, zoom } = input
  const lat = round6(input.lat)
  const lng = round6(toWestLon(input.lng))
  if (geo.kind === 'outside') return lines([`Pos: ${lat},${lng}`], [`GL: ${geo.maidenhead}`])
  if (geo.kind === 'error') return lines(['住所を取得できませんでした'], [`GL: ${geo.maidenhead}`])
  const link = ext(gsiUrl(lat, lng, zoom), `${lat},${lng}`)
  const pos: Child[] = ['位置:', isGPS ? link : h('i', {}, link)]
  const head: Child[] =
    geo.jccCode != null
      ? [`JCC${geo.jccCode}${geo.wardCode != null ? ` 区番号:${geo.wardCode}` : ''}`]
      : [`JCG${geo.jcgCode ?? ''}${geo.hamlogCode ?? ''}`]
  const place = geo.jccCode != null ? `${geo.prefecture}${geo.municipality}` : `${geo.prefecture}${geo.jcgText ?? ''}${geo.municipality}`
  const elevation = geo.elevation !== undefined ? `${geo.elevation}m` : '---'
  return lines(head, [place], [`GL:${geo.maidenhead}`], pos, [` 標高:${elevation}`])
}

export function buildPopup(input: PopupInput): HTMLElement {
  const { summit, zoom } = input
  const root = h('div', { class: 'act-popup' })
  const location = locationBlock(input)
  if (!summit) {
    // 山がなければ、位置の情報とリンクだけ
    root.append(...location, weatherLink(input.lat, input.lng, zoom))
    return root
  }
  // B1: 見出し(参照のリンクと名前)。B2: 山の詳細。そのあとに、クリックした位置の情報(B4)
  const heading = h('b', {}, h('div', { class: 'act-heading' }, ext(sotaUrl(summit.summitCode), `${summit.summitCode} ${summit.summitName}`), h('br'), summit.summitNameJ || summit.summitName))
  const summitPos = ext(gsiUrl(summit.latitude, summit.longitude, zoom), `${summit.latitude},${summit.longitude}`)
  const detail = lines(
    [summit.cityJ],
    [`GL:${summit.maidenhead}`],
    ['位置:', summitPos],
    [`標高:${summit.altM}m,${summit.points}pts (+${summit.bonusPoints})`],
  )
  const label = h('b', {}, input.isGPS ? '現在地: ' : 'クリック位置: ')
  const activations = [`Activations: ${summit.activationCount}`]
  const last = summit.activationCount !== 0 ? [`Last Activation: ${summit.activationDate}(${summit.activationCall})`] : null
  root.append(heading, ...detail, h('br'), label, ...location, weatherLink(input.lat, input.lng, zoom), h('br'), ...lines(activations, ...(last ? [last] : [])))
  return root
}
