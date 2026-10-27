/**
 * 地図の山・公園のマーカー(旧版 `placeSummitMarkers`・`redrawMarkers`)。
 * - 山: 標高で色分けした円(Canvas)。活動回数は、拡大(ズーム 12 以上)したときだけ、円の中に出す
 * - 公園: ピン(旧版と同じ画像)。ログがあれば、活動済み = 赤・複数区域 = 橙・試みだけ = 黄、なければ薄緑
 * 取得は、動かし終えたときに、前の取得を中断して 1 回だけ。取得済みの範囲に収まっていれば取り直さない。
 */
import L from 'leaflet'
import type { Api, PotaMarker, SotaMarker } from './api.ts'
import type { Prefs } from './prefs.ts'
import { referenceNodes } from './refs.ts'
import { covers, pad, splitBounds, toEastLon, toQuery, type Bounds } from './search.ts'

export function summitColor(alt: number): string {
  if (alt > 1500) return '#c62828'
  if (alt > 1100) return '#ef6c00'
  if (alt > 850) return '#f9a825'
  if (alt > 650) return '#9e9d24'
  if (alt > 500) return '#558b2f'
  return '#1b5e20'
}
export function summitRadius(zoom: number): number {
  return zoom > 14 ? 10 : zoom > 12 ? 8 : zoom > 10 ? 6 : 4
}

export type PinColor = 'red' | 'orange' | 'yellow' | 'green-light'
/** 公園のピンの色(旧版と同じ決まり)。ログの日付がなければ、活動していない公園 */
export function pinColor(p: Pick<PotaMarker, 'date' | 'locid' | 'act'>, showActLog: boolean): PinColor {
  if (p.date == null) return 'green-light'
  if (p.locid.length !== 1) return 'orange'
  return !showActLog || (p.act ?? 0) > 0 ? 'red' : 'yellow'
}

const TREE =
  '<path fill="#fff" transform="translate(8.5 7.5) scale(.75)" d="M17 8C8 10 5.9 16.2 3.8 21.3L5.7 22l1-2.3c.5.2 1 .3 1.3.3 11 0 14-17 14-17-1 2-8 2.3-13 3.3-5 1-7 5.2-7 7.2 0 1.6 1 3.1 2.5 3.6C8 14 11 10 17 8z"/>'

function parkIcon(color: PinColor): L.DivIcon {
  const html =
    `<img src="/img/pin-${color}.png" srcset="/img/pin-${color}@2x.png 2x" width="35" height="46" alt="" style="display:block">` +
    `<svg width="35" height="46" viewBox="0 0 35 46" aria-hidden="true" style="position:absolute;left:0;top:0">${TREE}</svg>`
  return L.divIcon({ className: `park-marker park-${color}`, html, iconSize: [35, 46], iconAnchor: [17, 42], popupAnchor: [1, -32] })
}

/** 見出しの文字(常時表示の名前。リンクにしない) */
function parkLabel(p: PotaMarker, prefs: Prefs): string {
  const nodes = referenceNodes({ pota: p.pota, jaff: p.wwff, name: p.nameJ }, prefs, false)
  return nodes.map((n) => (typeof n === 'string' ? n : (n as HTMLElement).tagName === 'BR' ? ' ' : (n as HTMLElement).textContent)).join('')
}

export interface MarkersOptions {
  map: L.Map
  api: Api
  prefs: () => Prefs
  logId: () => string | null
  onSummit: (s: SotaMarker) => void
  onPark: (p: PotaMarker) => void
}

export function createMarkers({ map, api, prefs, logId, onSummit, onPark }: MarkersOptions) {
  // モバイルは、指で押しやすいように、円の当たり判定を広げる
  const tolerance = matchMedia('(pointer: coarse)').matches ? 30 : 5
  const renderer = L.canvas({ tolerance })
  const layer = L.layerGroup().addTo(map)
  let generation = 0
  let controller: AbortController | null = null
  let fetched: { bounds: Bounds; key: string } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let last: { sota: SotaMarker[]; pota: PotaMarker[] } = { sota: [], pota: [] }

  function draw(sota: SotaMarker[], pota: PotaMarker[]) {
    layer.clearLayers()
    const p = prefs()
    const zoom = map.getZoom()
    if (p.sota_ref) {
      for (const s of sota) {
        const c = L.circleMarker([s.lat, s.lon], {
          renderer, radius: summitRadius(zoom), weight: 2, color: '#4e342e', fillColor: summitColor(s.alt), fillOpacity: 0.8,
        })
        if (zoom > 11) c.bindTooltip(String(s.count), { permanent: true, direction: 'center', className: 'summit-count' })
        c.on('click', (e) => { L.DomEvent.stopPropagation(e); onSummit(s) })
        layer.addLayer(c)
      }
    }
    for (const q of pota) {
      if (!(p.pota_ref || p.jaff_ref)) break
      const m = L.marker([q.lat, q.lon], { icon: parkIcon(pinColor(q, p.show_potaactlog)), title: q.nameJ })
      m.bindTooltip(parkLabel(q, p), { permanent: p.popup_permanent, direction: 'center', offset: [0, 20], className: 'park-name' })
      m.on('click', (e) => { L.DomEvent.stopPropagation(e); onPark(q) })
      layer.addLayer(m)
    }
  }

  async function refresh(force = false) {
    const b = map.getBounds()
    const now: Bounds = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }
    const zoom = map.getZoom()
    const p = prefs()
    const log = logId()
    const key = `${zoom}|${p.zoom_threshold}|${log ?? ''}`
    if (!force && covers(fetched, now, key)) return
    controller?.abort()
    controller = new AbortController()
    const gen = ++generation
    const wide = pad(now, 0.5)
    const results = await Promise.all(
      splitBounds(wide).map(async (r) => ({ r, res: await api.search(toQuery(r, zoom, p.zoom_threshold, log), controller!.signal) })),
    )
    if (gen !== generation || results.some((x) => x.res === null)) return
    const sota: SotaMarker[] = []
    const pota: PotaMarker[] = []
    for (const { r, res } of results) {
      for (const s of res!.sota) sota.push(r.needTrans ? { ...s, lon: toEastLon(s.lon) } : s)
      for (const q of res!.pota) pota.push(r.needTrans ? { ...q, lon: toEastLon(q.lon) } : q)
    }
    fetched = { bounds: wide, key }
    last = { sota, pota }
    draw(sota, pota)
  }

  const schedule = (force = false) => {
    clearTimeout(timer)
    timer = setTimeout(() => void refresh(force), 150)
  }
  map.on('moveend', () => schedule())
  // 設定やログが変わったら、取り直す(色・名前の表示は、取得し直さなくても描き直せる)
  return {
    layer,
    refresh: () => schedule(true),
    redraw: () => draw(last.sota, last.pota),
    start: () => void refresh(true),
  }
}
