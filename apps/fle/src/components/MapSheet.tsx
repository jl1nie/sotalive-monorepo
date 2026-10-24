import { useEffect, useId, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { useOnline } from '@/hooks/useOnline'
import { downloadRegionOf, loadSummitMap } from '@/lib/mapStore'
import { distanceKm, distanceLabel } from '@/lib/reference'
import { munisOf, pathOf, projector, summitOf, whereAmI, type Side, type SummitMap } from '@/lib/summitMap'
import { useT } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  /** 山頂のコード(JA/KN-017)。空なら、山頂が決まっていないことを出す */
  summit: string
}

/** 地図の SVG の幅(座標の単位) */
const W = 320

type Fix = { lat: number; lon: number; accuracy: number }
type GpsState = { status: 'waiting' } | { status: 'denied' } | { status: 'ok'; fix: Fix }

/** 山頂の簡易地図を、現在地と重ねて出す。地図は端末に保存したものを使い、なければ(オンラインなら)取ってくる */
export function MapSheet({ open, onClose, summit }: Props) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} title={summit ? t('map.title', { code: summit }) : t('map.titleNone')}>
      {open && (summit ? <MapBody summit={summit} /> : <p>{t('map.noSummit')}</p>)}
    </Sheet>
  )
}

function MapBody({ summit }: { summit: string }) {
  const t = useT()
  const online = useOnline()
  const [map, setMap] = useState<SummitMap | null | 'loading'>('loading')
  const gps = useGps()

  // 保存した地図をすぐ出し、電波があれば裏で取り直して差し替える(取り直しの操作は要らない)
  useEffect(() => {
    let alive = true
    void (async () => {
      const saved = await loadSummitMap(summit)
      if (!alive) return
      if (saved) setMap(saved)
      if (navigator.onLine && (await downloadRegionOf(summit))) {
        const fresh = await loadSummitMap(summit)
        if (alive && fresh) setMap(fresh)
        return
      }
      if (alive && !saved) setMap(null)
    })()
    return () => {
      alive = false
    }
  }, [summit])

  if (map === 'loading') return <p>{t('map.loading')}</p>
  if (!map) return <p>{online ? t('map.notFound') : t('map.offlineMissing')}</p>

  return (
    <div className="space-y-3">
      <MapSvg map={map} fix={gps.status === 'ok' ? gps.fix : null} />
      <GpsLine map={map} gps={gps} />
      <MuniList map={map} />
      <p className="text-xs text-gray-700 dark:text-gray-300">{map.attribution}</p>
    </div>
  )
}

/** シートを開いている間だけ、現在地を追う */
function useGps(): GpsState {
  const supported = 'geolocation' in navigator
  const [state, setState] = useState<GpsState>({ status: supported ? 'waiting' : 'denied' })
  useEffect(() => {
    if (!supported) return
    const id = navigator.geolocation.watchPosition(
      (p) => setState({ status: 'ok', fix: { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy } }),
      (e) => {
        if (e.code === e.PERMISSION_DENIED) setState({ status: 'denied' })
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [supported])
  return state
}

function MapSvg({ map, fix }: { map: SummitMap; fix: Fix | null }) {
  const t = useT()
  const hatch = useId()
  const { width, height, xy, perMeter } = projector(map.bbox, W)
  const peak = summitOf(map)
  const feats = map.features
  // 縮尺の棒: 地図の幅の 1/4 前後のきりのよい長さ
  const barM = [50, 100, 200, 500, 1000].find((m) => m * perMeter >= width / 6) ?? 1000
  const me = fix ? xy([fix.lon, fix.lat]) : null
  const meInside = me && me[0] >= 0 && me[0] <= width && me[1] >= 0 && me[1] <= height

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={t('map.svgLabel')}
      className="w-full rounded-xl border-2 border-gray-300 dark:border-gray-700 bg-white text-gray-950"
    >
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#15803d" strokeWidth="1.5" />
        </pattern>
      </defs>
      {feats.map((f, i) =>
        f.properties.kind === 'park' ? (
          <path
            key={`p${i}`}
            d={pathOf(f.geometry, xy)}
            fill={`url(#${hatch})`}
            fillOpacity={0.6}
            stroke="#15803d"
            strokeDasharray="3 2"
            fillRule="evenodd"
          />
        ) : null
      )}
      {feats.map((f, i) =>
        f.properties.kind === 'zone' ? (
          <path key={`z${i}`} d={pathOf(f.geometry, xy)} fill="#dc2626" fillOpacity={0.3} stroke="#dc2626" fillRule="evenodd" />
        ) : null
      )}
      {feats.map((f, i) =>
        f.properties.kind === 'border' ? (
          <path key={`b${i}`} d={pathOf(f.geometry, xy)} fill="none" stroke="#374151" strokeWidth={1.5} />
        ) : null
      )}
      {feats.map((f, i) => {
        const p = f.properties
        if (p.kind !== 'muni' || f.geometry.type !== 'Point') return null
        const [x, y] = xy(f.geometry.coordinates)
        const lines = [p.name, ...(p.pota.length ? p.pota.map((q) => potaLabel(q, t)) : [t('map.noPota')])]
        return (
          <text key={`m${i}`} x={x} y={y} textAnchor="middle" fontSize="11" fill="#111827" stroke="#fff" strokeWidth="3" paintOrder="stroke">
            {lines.map((l, j) => (
              <tspan key={j} x={x} dy={j === 0 ? 0 : 13}>
                {l}
              </tspan>
            ))}
          </text>
        )
      })}
      {peak && (() => {
        const [x, y] = xy(peak)
        return <path d={`M${x},${y - 7}L${x + 6},${y + 4}L${x - 6},${y + 4}Z`} fill="#111827" />
      })()}
      {me && meInside && (
        <g>
          <circle cx={me[0]} cy={me[1]} r={Math.max(4, fix!.accuracy * perMeter)} fill="#2563eb" fillOpacity={0.15} stroke="#2563eb" strokeWidth={1} />
          <circle cx={me[0]} cy={me[1]} r={5} fill="#2563eb" stroke="#fff" strokeWidth={2} />
        </g>
      )}
      <g transform={`translate(8,${height - 10})`}>
        <line x1="0" y1="0" x2={barM * perMeter} y2="0" stroke="#111827" strokeWidth="2" />
        <text x={barM * perMeter + 4} y="4" fontSize="10" fill="#111827">
          {barM >= 1000 ? `${barM / 1000}km` : `${barM}m`}
        </text>
      </g>
    </svg>
  )
}

function potaLabel(q: { code: string; coverage: 'all' | 'part' }, t: ReturnType<typeof useT>): string {
  return q.coverage === 'all' ? q.code : t('map.partial', { code: q.code })
}

/** 現在地の答え: ゾーンの中か、いまいる市区町村(ログに書く JCC・JCG)と、そこで当たる POTA の公園の中か */
function GpsLine({ map, gps }: { map: SummitMap; gps: GpsState }) {
  const t = useT()
  if (gps.status === 'waiting') return <p>{t('map.gpsWaiting')}</p>
  if (gps.status === 'denied') return <p>{t('map.gpsDenied')}</p>
  const { lat, lon, accuracy } = gps.fix
  const where = whereAmI(map, [lon, lat], accuracy)
  const peak = summitOf(map)
  const dist = peak ? distanceLabel(distanceKm(lat, lon, peak[1], peak[0])) : ''
  const zoneText = { in: t('map.inZone'), out: t('map.outZone', { dist }), near: t('map.nearZone') }[where.zone]
  const sideText = (side: Side) => ({ in: t('map.inPark'), out: t('map.outPark'), near: t('map.nearPark') })[side]
  return (
    <div className="space-y-1" role="status">
      <p className={where.zone === 'in' ? 'font-bold text-green-700 dark:text-green-400' : 'font-bold'}>
        {zoneText}
        <span className="ml-2 text-sm font-normal text-gray-700 dark:text-gray-300">{t('map.accuracy', { m: String(Math.round(accuracy)) })}</span>
      </p>
      {where.muni && (
        <p className="font-bold">
          {t('map.here')} {where.muni.name} <span className="font-mono">{where.muni.key}</span>
          {where.muni.near && <span className="ml-1 font-normal text-amber-800 dark:text-amber-300">{t('map.nearBorder')}</span>}
        </p>
      )}
      {where.muni && where.zone !== 'out' && (
        <ul className="text-sm">
          {where.pota.length === 0 ? (
            <li>{t('map.noPota')}</li>
          ) : (
            where.pota.map((q) => (
              <li key={q.code} className={q.side === 'in' ? 'font-bold text-green-700 dark:text-green-400' : q.side === 'near' ? 'font-bold text-amber-800 dark:text-amber-300' : ''}>
                <span className="font-mono">{q.code}</span> {sideText(q.side)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

/** 市区町村ごとに、選ぶと当たる POTA */
function MuniList({ map }: { map: SummitMap }) {
  const t = useT()
  const munis = munisOf(map)
  if (munis.length === 0) return null
  return (
    <ul className="space-y-1 text-sm">
      {munis.map((m) => (
        <li key={m.key}>
          <span className="font-bold">{m.name}</span>
          <span className="ml-1 font-mono text-gray-700 dark:text-gray-300">{m.key}</span>
          {': '}
          {m.pota.length ? m.pota.map((q) => potaLabel(q, t)).join(', ') : t('map.noPota')}
        </li>
      ))}
      {munis.some((m) => m.pota.some((q) => q.coverage === 'part')) && (
        <li className="text-gray-700 dark:text-gray-300">{t('map.partialHint')}</li>
      )}
    </ul>
  )
}
