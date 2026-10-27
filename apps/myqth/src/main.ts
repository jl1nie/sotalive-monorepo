import 'bootstrap/dist/css/bootstrap.min.css'
import 'leaflet/dist/leaflet.css'
import './style.css'
import L from 'leaflet'
import { reverseGeocode } from '@sotalive/geo'
import { COOKIE_LAT, COOKIE_LNG, getCookie, setCookie } from './cookie.ts'
import { PENDING_HINT_MS, MESSAGES, StatusBanner, errorMessage, queryPermission, waitingMessage } from './locate-status.ts'
import { qthIcon } from './marker.ts'
import { popupHtml, round6 } from './popup.ts'
import { ZoomLabel } from './zoom-label.ts'

const JAPAN: L.LatLngTuple = [37.514444, 137.712222]
const JAPAN_ZOOM = 6

const gsi = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
  maxZoom: 18,
  maxNativeZoom: 18,
  attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>",
})
// 旧版(Leaflet 1.2)と同じ、文字だけの表示(1.9 の既定は、旗のアイコンが付く)
const map = L.map('map', { layers: [gsi], attributionControl: false }).setView(JAPAN, JAPAN_ZOOM)
L.control
  .attribution({ prefix: '<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>' })
  .addTo(map)
L.control.scale().addTo(map)
new ZoomLabel().addTo(map)
// 地図の入れ物の大きさが変わったら、タイルを描き直す(iPad の回転・分割表示・アドレスバーの出入り)。
// Leaflet は window の resize だけを見るので、入れ物の大きさの変化を、自分で知らせる
new ResizeObserver(() => map.invalidateSize()).observe(map.getContainer())
// e2e から地図を触るため
;(window as unknown as { map: L.Map }).map = map

const popup = L.popup()
const banner = new StatusBanner(map.getContainer())
// 位置の取得の 1 回ごとの、保留を知らせるタイマー
let pendingTimer: ReturnType<typeof setTimeout> | undefined
let qthMarker: L.Marker | null = null

async function displayPopup(latlng: L.LatLngLiteral, isMarker: boolean, isGPS: boolean) {
  const lat = round6(latlng.lat)
  const lng = round6(latlng.lng)
  if (isGPS) {
    setCookie(COOKIE_LAT, lat)
    setCookie(COOKIE_LNG, lng)
  }
  const res = await reverseGeocode(lat, lng, { elevation: true })
  const html = popupHtml(res, { lat, lng, rawLat: latlng.lat, rawLng: latlng.lng, isGPS, isMarker })
  if (isMarker) {
    qthMarker?.bindPopup(html).openPopup()
  } else {
    popup.setContent(html).setLatLng(latlng).openOn(map)
  }
}

map.on('click', (e: L.LeafletMouseEvent) => {
  void displayPopup(e.latlng, false, false)
})

function onLocated(pos: GeolocationPosition) {
  clearTimeout(pendingTimer)
  banner.hide()
  const latlng: L.LatLngTuple = [pos.coords.latitude, pos.coords.longitude]
  map.setView(latlng, 15)
  qthMarker?.remove()
  qthMarker = L.marker(latlng, { draggable: true, icon: qthIcon() }).addTo(map)
  void displayPopup({ lat: latlng[0], lng: latlng[1] }, true, true)
  qthMarker.on('dragend', (e) => {
    const moved = (e.target as L.Marker).getLatLng()
    map.setView(moved, 15)
    void displayPopup(moved, true, false)
  })
}

function onLocateError(err: GeolocationPositionError) {
  clearTimeout(pendingTimer)
  banner.show(errorMessage(err.code))
  const messages: Record<number, string> = {
    1: '位置情報の利用が許可されていません',
    2: '端末位置がわかりませんでした',
    3: 'タイムアウトしました',
  }
  window.alert(messages[err.code] ?? 'エラーが発生しました')
  const lat = getCookie(COOKIE_LAT)
  const lng = getCookie(COOKIE_LNG)
  if (lat && lng) map.setView([parseFloat(lat), parseFloat(lng)], 13)
  else map.setView(JAPAN, JAPAN_ZOOM)
}

function locate() {
  if (typeof navigator.geolocation === 'undefined') {
    window.alert('ブラウザが位置情報取得に対応していません')
    map.setView(JAPAN, JAPAN_ZOOM)
    return
  }
  clearTimeout(pendingTimer)
  banner.show(MESSAGES.waiting)
  let settled = false
  const done = () => {
    settled = true
    clearTimeout(pendingTimer)
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      done()
      onLocated(pos)
    },
    (err) => {
      done()
      onLocateError(err)
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  )
  // 許可の状態は、取得の開始を待たせずに調べ、まだ待っているときだけ、文言を替える
  void queryPermission().then((state) => {
    if (!settled) banner.show(waitingMessage(state))
  })
  // 許可の確認が保留のままだと、コールバックが呼ばれない。画面で気づけるようにする
  pendingTimer = setTimeout(() => {
    if (!settled) banner.show(MESSAGES.pending)
  }, PENDING_HINT_MS)
}
document.getElementById('qth-button')?.addEventListener('click', locate)

function clock() {
  const el = document.getElementById('clock_time')
  if (el) el.textContent = new Date().toString().replace(/:\d{2} GMT\+.+/, '')
}
clock()
setInterval(clock, 5000)

locate()
