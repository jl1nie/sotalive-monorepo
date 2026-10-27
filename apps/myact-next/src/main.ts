import 'bootstrap/dist/css/bootstrap.min.css'
import 'leaflet/dist/leaflet.css'
import './style.css'
import L from 'leaflet'
import { reverseGeocode } from '@sotalive/geo'
import { createApi } from './api.ts'
import { COOKIE_LAT, COOKIE_LNG, getCookie, setCookie } from './cookie.ts'
import { MESSAGES, StatusBanner, errorMessage, queryPermission, waitingMessage, PENDING_HINT_MS } from './locate-status.ts'
import { qthIcon } from './marker.ts'
import { createPotaLogDialog } from './potalog.ts'
import { buildPopup } from './popup.ts'
import { createPrefs } from './prefs.ts'
import { ZoomLabel } from './zoom-label.ts'

const JAPAN: L.LatLngTuple = [37.514444, 137.712222]
const JAPAN_ZOOM = 6

const api = createApi()
const prefs = createPrefs({ get: getCookie, set: setCookie })

// ---- 地図(旧版と同じ。地理院タイル。初期は日本全体) ----
const gsi = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
  maxZoom: 18,
  maxNativeZoom: 18,
  attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>",
})
const map = L.map('map', { layers: [gsi], attributionControl: false }).setView(JAPAN, JAPAN_ZOOM)
L.control.attribution({ prefix: '<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>' }).addTo(map)
L.control.scale().addTo(map)
new ZoomLabel().addTo(map)
// 入れ物の大きさが変わったら、タイルを描き直す(回転・分割表示・アドレスバーの出入り)
new ResizeObserver(() => map.invalidateSize()).observe(map.getContainer())
// e2e から地図を触るため
;(window as unknown as { map: L.Map }).map = map

// ---- ポップアップ(地図の空白をクリック) ----
const popup = L.popup({ maxWidth: 300 })
let qthMarker: L.Marker | null = null

async function showPopup(latlng: L.LatLngLiteral, isGPS: boolean, target: 'popup' | 'marker') {
  // 近くの山と、住所・標高を、同時に聞く(旧版は、山のあとに住所だった)
  const [summits, geo] = await Promise.all([
    api.summitsNear(latlng.lat, latlng.lng, 200, prefs.logId()),
    reverseGeocode(Math.round(latlng.lat * 1e6) / 1e6, Math.round(latlng.lng * 1e6) / 1e6, { elevation: true }),
  ])
  const content = buildPopup({ lat: latlng.lat, lng: latlng.lng, zoom: map.getZoom(), isGPS, geo, summit: summits?.[0] ?? null })
  if (target === 'marker') qthMarker?.bindPopup(content, { maxWidth: 300 }).openPopup()
  else popup.setContent(content).setLatLng(latlng).openOn(map)
}

map.on('click', (e: L.LeafletMouseEvent) => {
  void showPopup(e.latlng, false, 'popup')
})

// ---- 現在地(QTH)。位置の取得の状況は、地図の上の帯に出す ----
const banner = new StatusBanner(map.getContainer())
let pendingTimer: ReturnType<typeof setTimeout> | undefined

function onLocated(pos: GeolocationPosition) {
  const latlng: L.LatLngTuple = [pos.coords.latitude, pos.coords.longitude]
  setCookie(COOKIE_LAT, Math.round(latlng[0] * 1e6) / 1e6)
  setCookie(COOKIE_LNG, Math.round(latlng[1] * 1e6) / 1e6)
  map.setView(latlng, 15)
  qthMarker?.remove()
  qthMarker = L.marker(latlng, { draggable: true, icon: qthIcon() }).addTo(map)
  void showPopup({ lat: latlng[0], lng: latlng[1] }, true, 'marker')
  qthMarker.on('dragend', (e) => {
    const moved = (e.target as L.Marker).getLatLng()
    map.setView(moved, 15)
    void showPopup(moved, false, 'marker')
  })
}

function onLocateError(err: GeolocationPositionError) {
  banner.show(errorMessage(err.code))
  const lat = getCookie(COOKIE_LAT)
  const lng = getCookie(COOKIE_LNG)
  if (lat && lng) map.setView([parseFloat(lat), parseFloat(lng)], 13)
  else map.setView(JAPAN, JAPAN_ZOOM)
}

function locate() {
  if (typeof navigator.geolocation === 'undefined') {
    banner.show('このブラウザは、位置情報の取得に対応していません')
    return
  }
  clearTimeout(pendingTimer)
  banner.show(MESSAGES.waiting)
  let settled = false
  const done = () => { settled = true; clearTimeout(pendingTimer) }
  navigator.geolocation.getCurrentPosition(
    (pos) => { done(); banner.hide(); onLocated(pos) },
    (err) => { done(); onLocateError(err) },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  )
  void queryPermission().then((state) => { if (!settled) banner.show(waitingMessage(state)) })
  pendingTimer = setTimeout(() => { if (!settled) banner.show(MESSAGES.pending) }, PENDING_HINT_MS)
}
document.getElementById('qth-button')?.addEventListener('click', locate)

// ---- POTA ログ(必須の機能。ナビバーから開く) ----
const potaLog = createPotaLogDialog({ prefs, api })
document.body.append(potaLog.element)
document.getElementById('potalog-button')?.addEventListener('click', () => potaLog.open())

// ---- 時計 ----
function clock() {
  const el = document.getElementById('clock_time')
  if (el) el.textContent = new Date().toString().replace(/:\d{2} GMT\+.+/, '')
}
clock()
setInterval(clock, 5000)

// 旧版と同じ: URL の ?lat=&lon=&z= があれば、その地点のポップアップを開く(z は 5〜18。既定 15)。なければ現在地
function urlPosition(): { latlng: L.LatLngTuple; zoom: number } | null {
  const q = new URLSearchParams(window.location.search)
  const lat = parseFloat(q.get('lat') ?? '')
  const lng = parseFloat(q.get('lon') ?? '')
  let z = parseInt(q.get('z') ?? '', 10)
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return null
  if (!(z >= 5 && z <= 18)) z = 15
  return { latlng: [lat, lng], zoom: z }
}
const start = urlPosition()
if (start) {
  map.setView(start.latlng, start.zoom, { animate: false })
  void showPopup({ lat: start.latlng[0], lng: start.latlng[1] }, false, 'popup')
} else {
  locate()
}
