/**
 * 地図のポップアップ(旧版 `displayPopup`。docs/myact-next-design.md の 6.2 の B1〜B5)。
 * 旧版の golden master(packages/myact-golden/expected)と、同じ行・同じ順序・同じ文言。
 * HTML の文字列は組み立てない: 外から来る値(山の名前・住所など)は、すべて textContent で入れる(旧版は、一部が未エスケープだった)。
 */
import type { GeoResult } from '@sotalive/geo'
import { h, type Child } from './dom.ts'
import type { PotaPark, SotaSummit } from './api.ts'
import { referenceHeading, type Area, type RefPrefs } from './refs.ts'
import { toWestLon } from './search.ts'

export interface PopupPrefs extends RefPrefs {
  show_potalog: boolean
  link_googlemap: boolean
  display_mapcode: boolean
}

export interface PopupInput {
  /** クリックした位置(丸めていない) */
  lat: number
  lng: number
  zoom: number
  /** 現在地(GPS)か。位置の行を、斜体にしない */
  isGPS: boolean
  geo: GeoResult
  /** 山・公園のマーカー・公園区域から開いたとき、その参照(なければ、空白のクリック) */
  area: Area
  /** 半径 200m 以内のサミット(空白のクリックのとき) */
  summit: SotaSummit | null
  /** 公園の詳細(公園のとき。ログがあれば、Activations/Attempts・QSOs) */
  park: PotaPark | null
  prefs: PopupPrefs
  /** マップコードのリンクを押したとき、座標をコピーする */
  onCopyCoords?: (lat: number, lng: number, anchor: HTMLElement) => void
}

const round6 = (v: number) => Math.round(v * 1000000) / 1000000

/** 位置のリンク。設定で、地理院地図か Google マップ(旧版 locURI) */
export function locationUrl(lat: number, lng: number, zoom: number, googleMap: boolean): string {
  return googleMap
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
    : `https://maps.gsi.go.jp/#${zoom}/${lat}/${lng}`
}
export const windyUrl = (lat: number, lng: number, zoom: number) =>
  `https://www.windy.com/${lat}/${lng}/meteogram?rain,${lat},${lng},${Math.min(zoom, 11)}`

/** 外部へのリンク(新しいタブ。旧版にない rel=noopener を付ける) */
const ext = (href: string, ...children: Child[]) => h('a', { href, target: '_blank', rel: 'noopener' }, ...children)

/** 行ごとに <br> でつなぐ(旧版と同じ構造。innerText が、旧版と同じ行になる) */
function lines(...parts: Child[][]): Node[] {
  const out: Node[] = []
  parts.forEach((p, i) => {
    if (i > 0) out.push(h('br'))
    for (const c of p) if (c !== null && c !== false && c !== undefined) out.push(typeof c === 'string' ? document.createTextNode(c) : c)
  })
  return out
}

/** B5: 天気(Windy)。旧版は、太陽・雲・雨の画像 3 枚(文字なし) */
function weatherLink(lat: number, lng: number, zoom: number) {
  const icon = (d: string) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="${d}"/></svg>`
  const a = h('a', { href: windyUrl(lat, lng, zoom), target: '_blank', rel: 'noopener', class: 'weather', 'aria-label': '天気(Windy)' })
  a.innerHTML = icon('M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3') + icon('M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.500 3.500 0 0 0 1 7z') + icon('M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 7a3.500 3.500 0 0 0 1 7zM8 18l-1 3M12 18l-1 3M16 18l-1 3')
  return h('span', { class: 'weather-wrap' }, '  ', a)
}

/** B5: マップコード(japanmapcode.com)。押すと、座標をコピーして、サイトを開く */
function mapcodeLink(lat: number, lng: number, onCopy?: PopupInput['onCopyCoords']) {
  const img = h('img', { src: '/img/mc_long.jpg', height: '14', alt: '' })
  const a = h('a', { href: 'https://japanmapcode.com/en', target: '_blank', rel: 'noopener', 'aria-label': 'マップコード(japanmapcode.com)' }, img)
  a.addEventListener('click', () => onCopy?.(lat, lng, a))
  return h('div', { class: 'act-mapcode' }, a)
}

/** B4: 位置の情報(JCC/JCG・住所・GL・位置・標高)。日本の外は Pos と GL だけ。失敗は、理由 */
function locationBlock(input: PopupInput): Node[] {
  const { geo, isGPS, zoom } = input
  const lat = round6(input.lat)
  const lng = round6(toWestLon(input.lng))
  if (geo.kind === 'outside') return lines([`Pos: ${lat},${lng}`], [`GL: ${geo.maidenhead}`])
  if (geo.kind === 'error') return lines(['住所を取得できませんでした'], [`GL: ${geo.maidenhead}`])
  const link = ext(locationUrl(lat, lng, zoom, input.prefs.link_googlemap), `${lat},${lng}`)
  const pos: Child[] = ['位置:', isGPS ? link : h('i', {}, link)]
  const head: Child[] =
    geo.jccCode != null
      ? [`JCC${geo.jccCode}${geo.wardCode != null ? ` 区番号:${geo.wardCode}` : ''}`]
      : [`JCG${geo.jcgCode ?? ''}${geo.hamlogCode ?? ''}`]
  const place = geo.jccCode != null ? `${geo.prefecture}${geo.municipality}` : `${geo.prefecture}${geo.jcgText ?? ''}${geo.municipality}`
  const elevation = geo.elevation !== undefined ? `${geo.elevation}m` : '---'
  return lines(head, [place], [`GL:${geo.maidenhead}`], pos, [` 標高:${elevation}`])
}

/** B2: 山の詳細(市区町村・GL・位置・標高・ポイント) */
function summitBlock(s: SotaSummit, zoom: number, googleMap: boolean): Node[] {
  return lines(
    [s.cityJ],
    [`GL:${s.maidenhead}`],
    ['位置:', ext(locationUrl(s.latitude, s.longitude, zoom, googleMap), `${s.latitude},${s.longitude}`)],
    [`標高:${s.altM}m,${s.points}pts (+${s.bonusPoints})`],
  )
}

/** B2 の続き(Activations)と、B3(POTA ログ)。旧版 qsomesg */
function activityLines(input: PopupInput): Node[] {
  const { summit, park, prefs } = input
  if (summit) {
    const parts: Child[][] = [[`Activations: ${summit.activationCount}`]]
    if (summit.activationCount !== 0) parts.push([`Last Activation: ${summit.activationDate}(${summit.activationCall})`])
    return [h('br'), ...lines(...parts)]
  }
  if (park && prefs.show_potalog) {
    if (park.attempts != null) return [h('br'), ...lines([`Activations/Attempts: ${park.activations}/${park.attempts}`], [`QSOs: ${park.qsos}`]), h('br')]
    if (park.qsos != null) return [h('br'), ...lines([`QSOs: ${park.qsos}`]), h('br')]
  }
  return []
}

/** 山が見つかったとき、見出しに使う参照(コードと山名 + 日本語名) */
export function summitArea(summit: SotaSummit): Area {
  return { sota_code: summit.summitCode, sota: `${summit.summitCode} ${summit.summitName}`, name: summit.summitNameJ || summit.summitName }
}

export function buildPopup(input: PopupInput): HTMLElement {
  const { summit, zoom, prefs, isGPS } = input
  const area: Area = summit ? { ...input.area, ...summitArea(summit) } : input.area
  const heading = referenceHeading(area, prefs, true)
  const location = locationBlock(input)
  const weather = weatherLink(input.lat, input.lng, zoom)
  const mapcode = prefs.display_mapcode ? mapcodeLink(input.lat, input.lng, input.onCopyCoords) : null
  const root = h('div', { class: 'act-popup' })

  if (!heading) {
    // 参照がなければ、位置の情報とリンクだけ
    root.append(...location, weather, ...(mapcode ? [mapcode] : []))
    return root
  }
  // 見出し(太字)→ [山: 詳細 → 「クリック位置:」] → 位置の情報 → リンク → Activations・POTA ログ
  const body: Node[] = []
  if (summit) body.push(...summitBlock(summit, zoom, prefs.link_googlemap), h('br'), h('b', {}, isGPS ? '現在地: ' : 'クリック位置: '))
  body.push(...location, weather)
  root.append(h('b', {}, heading), ...body, ...(mapcode ? [mapcode] : []), ...activityLines(input))
  return root
}
