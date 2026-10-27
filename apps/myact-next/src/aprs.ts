/**
 * SOTA の APRS 軌跡(旧版 `refresh_aprs_track`・`drawAPRSTrack`)と、地磁気の指数(`kp_index`)。
 * - 軌跡: 24 時間分。線(青)・点(赤)・最後の位置のマーカー(黄色の星。SSID で 人・車・家)。3 分ごとに取り直す
 * - 地磁気: 時計の横に `A:5 K:1`。30 分ごと
 * 他人が書ける文字(コメント・コールサイン)は、textContent で入れる(HTML として解釈しない)。
 * 旧版との差分: マーカーごとにポップアップを自動で開かない(旧版は、全部開いて、最後の 1 つだけが残った)。押すと開く。
 */
import L from 'leaflet'
import { h } from './dom.ts'
import type { Api } from './api.ts'

export const APRS_REFRESH_MS = 180_000
export const GEOMAG_REFRESH_MS = 1_800_000

export interface AprsProps {
  ssid: string
  callsign: string
  lastseen: string
  distance: string | number
  summit: string
  spot_summit?: string | null
  spot_time?: string | null
  spot_freq?: string | null
  spot_mode?: string | null
  spot_comment?: string | null
}
export interface AprsTrack {
  properties: AprsProps
  geometry: { coordinates: [number, number][] }
}

const md = (d: Date) => d.toLocaleString('en-us', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
const hm = (d: Date) => d.toLocaleString('en-us', { hour: 'numeric', minute: 'numeric' })

/** 局の種類(旧版: SSID 5・7 = 徒歩、9 = 車、ほかは固定局) */
export type Station = 'person' | 'car' | 'home'
export const stationOf = (ssid: string): Station => (ssid === '5' || ssid === '7' ? 'person' : ssid === '9' ? 'car' : 'home')

const GLYPH: Record<Station, string> = {
  person: '<circle cx="12" cy="7" r="3.2"/><path d="M5.500 20c0-4.200 2.800-7 6.500-7s6.500 2.800 6.500 7z"/>',
  car: '<path d="M4 15l1.800-5.200c.3-.9 1-1.300 1.900-1.300h8.600c.9 0 1.600.4 1.900 1.300L20 15v4h-2.500v-1.500h-11V19H4z"/>',
  home: '<path d="M12 4l9 8h-2.500v8h-4.500v-5h-4v5H5.500v-8H3z"/>',
}
const STAR = '<path d="M17.500 1l4.500 9.300 10.200 1.400-7.400 7.200 1.800 10.100-9.100-4.800-9.100 4.800 1.800-10.100L2.800 11.700 13 10.300z" fill="#f5bb30" stroke="#c98a12" stroke-width="1.200"/>'

export function stationIcon(kind: Station): L.DivIcon {
  const html = `<svg xmlns="http://www.w3.org/2000/svg" width="35" height="35" viewBox="0 0 35 35">${STAR}<g transform="translate(5.500 6) scale(.5)" fill="#fff" stroke="#6d4c00" stroke-width="1.500" paint-order="stroke">${GLYPH[kind]}</g></svg>`
  return L.divIcon({ className: `aprs-marker aprs-${kind}`, html, iconSize: [35, 35], iconAnchor: [17, 17], popupAnchor: [0, -14] })
}

/** 最後の位置のマーカーのポップアップ(旧版と同じ行) */
export function aprsPopup(p: AprsProps): HTMLElement {
  const head = h('b', {}, `${md(new Date(p.lastseen))} ${p.callsign} (${p.distance}m from ${p.summit})`)
  const root = h('div', {}, head)
  if (p.spot_time && parseInt(String(p.distance), 10) < 500) {
    root.append(h('br'), h('div', { class: 'act-heading' }, `${hm(new Date(p.spot_time))} ${p.spot_freq ?? ''} ${p.spot_mode ?? ''} ${p.spot_summit ?? ''}`, h('br'), p.spot_comment ?? ''))
  }
  return root
}

export function createAprs({ map, api }: { map: L.Map; api: Api }) {
  let layer: L.LayerGroup | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  let wanted = false

  async function refresh() {
    layer?.remove()
    if (!wanted) return
    const next = L.layerGroup()
    const res = await api.aprsTracks()
    if (!wanted || !res) return
    for (const t of res.tracks) {
      const coords = t.geometry.coordinates as L.LatLngTuple[]
      if (coords.length === 0) continue
      L.polyline(coords, { color: '#0d47a1', opacity: 0.4, weight: 4 }).addTo(next)
      for (const c of coords) L.circleMarker(c, { color: '#ff1744', radius: 2 }).addTo(next)
      L.marker(coords[coords.length - 1], { icon: stationIcon(stationOf(t.properties.ssid)) }).bindPopup(aprsPopup(t.properties)).addTo(next)
    }
    layer = next.addTo(map)
  }

  return {
    get layer() { return layer },
    /** 設定に合わせて、始める・止める */
    update(show: boolean) {
      if (show === wanted) return
      wanted = show
      clearInterval(timer)
      if (show) {
        void refresh()
        timer = setInterval(() => void refresh(), APRS_REFRESH_MS)
      } else {
        layer?.remove()
        layer = null
      }
    },
  }
}
