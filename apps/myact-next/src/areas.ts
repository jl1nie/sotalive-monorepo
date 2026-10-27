/**
 * 公園区域(自然公園の区域。TopoJSON)の層(旧版 `updateGeoJson`)。表示にしたときに初めて読み込み、その後は付け外しだけ。
 * 区域を左クリックすると、その公園のポップアップ。右クリックは、区域の ID(PID, UID)を JAFF に併記する(確認用)。
 * 版の番号は、tools/jaffpota の release が書き換える(tools/jaffpota/jaffpota/release.py の REFERENCES)。
 */
import L from 'leaflet'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import type { Area } from './refs.ts'

export const AREA_URL = '/json/jaffpota-annotated-v24.json'

const ATTRIBUTION =
  "公園区域: <a href='https://www.biodic.go.jp/' target='_blank' rel='noopener'>国立公園区域GISデータ(環境省生物多様性センター)</a>・" +
  "<a href='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A10-v3_1.html' target='_blank' rel='noopener'>国土数値情報(自然公園地域)</a>を加工"

interface AreaProps {
  POTA: string
  JAFF: string
  NAME: string
  PID?: number
  UID?: number
}

export interface AreasOptions {
  map: L.Map
  /** 区域を押したとき(クリックした位置と、公園) */
  onPick: (latlng: L.LatLng, area: Area) => void
  fetch?: typeof fetch
}

export function createAreas({ map, onPick, fetch: doFetch = (...a) => fetch(...a) }: AreasOptions) {
  // 山・公園のマーカーより下(overlayPane 400 の下)。マーカーを押せるように
  map.createPane('areas').style.zIndex = '390'
  const layer = L.geoJSON(undefined, {
    pane: 'areas',
    attribution: ATTRIBUTION,
    style: () => ({ color: '#000', opacity: 1, weight: 1, fillColor: '#9fa8da', fillOpacity: 0.3 }),
    onEachFeature(f, l) {
      const p = f.properties as AreaProps
      l.on('click', (e: L.LeafletMouseEvent) => {
        onPick(e.latlng, { pota: p.POTA, jaff: p.JAFF, name: p.NAME })
        L.DomEvent.stop(e)
      })
      l.on('contextmenu', (e: L.LeafletMouseEvent) => {
        onPick(e.latlng, { pota: p.POTA, jaff: `${p.JAFF}(${p.PID},${p.UID})`, name: p.NAME })
        L.DomEvent.stop(e)
      })
    },
  })
  let loaded = false

  async function load() {
    if (loaded) return
    loaded = true
    try {
      const res = await doFetch(AREA_URL)
      if (!res.ok) throw new Error(String(res.status))
      const topo = (await res.json()) as Topology
      for (const obj of Object.values(topo.objects)) layer.addData(feature(topo, obj) as unknown as GeoJSON.FeatureCollection)
    } catch (e) {
      loaded = false // 次に表示にしたとき、もう一度読む
      console.warn('公園区域:', e)
    }
  }

  return {
    layer,
    /** 設定に合わせて、付け外し */
    update(show: boolean) {
      if (show) {
        if (!map.hasLayer(layer)) layer.addTo(map)
        void load()
      } else if (map.hasLayer(layer)) map.removeLayer(layer)
    },
  }
}
