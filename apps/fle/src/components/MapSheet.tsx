import { useEffect, useId, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { useOnline } from '@/hooks/useOnline'
import { loadSummitMap, refreshRegionOf } from '@/lib/mapStore'
import { isOffline } from '@/lib/net'
import { distanceKm, distanceLabel } from '@/lib/reference'
import {
  labelPointIn,
  munisOf,
  parkCodesOf,
  parkStyleOf,
  pathOf,
  projector,
  summitAltOf,
  summitNameOf,
  summitOf,
  whereAmI,
  withoutPrefecture,
  type SummitMap,
} from '@/lib/summitMap'
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

  // 保存した地図をすぐ出し、電波があれば裏で、サーバーに新しい版があるときだけ取り直して差し替える(取り直しの操作は要らない)。
  // 保存がなく、通信が止まっているときは、待たずに「地図なし」にする(電波が弱いときも、短い時間切れと遮断で、長く待たない)
  useEffect(() => {
    let alive = true
    void (async () => {
      const saved = await loadSummitMap(summit)
      if (!alive) return
      if (saved) setMap(saved)
      else if (isOffline()) {
        setMap(null)
        return
      }
      const result = await refreshRegionOf(summit)
      if (!alive) return
      if (result === 'updated') {
        const fresh = await loadSummitMap(summit)
        if (alive && fresh) {
          setMap(fresh)
          return
        }
      }
      if (!saved) setMap(null)
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
      <ReadingCard map={map} here={gps.status === 'ok' ? whereAmI(map, [gps.fix.lon, gps.fix.lat], gps.fix.accuracy).muni?.key : undefined} />
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
  const codes = parkCodesOf(map)
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
        {/* 公園ごとに、斜線の色と向きを変える(公園が重なる・隣り合うところでも見分けられるように) */}
        {codes.map((c, i) => {
          const st = parkStyleOf(codes, c)
          return (
            <pattern key={c} id={`${hatch}-${i}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={`rotate(${st.angle})`}>
              <line x1="0" y1="0" x2="0" y2="6" stroke={st.color} strokeWidth="1.5" />
            </pattern>
          )
        })}
      </defs>
      {feats.map((f, i) =>
        f.properties.kind === 'park' ? (
          <path
            key={`p${i}`}
            d={pathOf(f.geometry, xy)}
            fill={`url(#${hatch}-${codes.indexOf(f.properties.code)})`}
            fillOpacity={0.6}
            stroke={parkStyleOf(codes, f.properties.code).color}
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
      {/* 公園の区域の中に、番号を書く */}
      {feats.map((f, i) => {
        const p = f.properties
        if (p.kind !== 'park') return null
        const at = labelPointIn(f.geometry, map.bbox)
        if (!at) return null
        const [x, y] = xy(at)
        return (
          <text key={`pl${i}`} x={x} y={y} textAnchor="middle" fontSize="10" fontWeight="bold" fill={parkStyleOf(codes, p.code).color} stroke="#fff" strokeWidth="3" paintOrder="stroke">
            {p.code}
          </text>
        )
      })}
      {feats.map((f, i) => {
        const p = f.properties
        if (p.kind !== 'muni' || f.geometry.type !== 'Point') return null
        const [x, y] = xy(f.geometry.coordinates)
        const lines = [withoutPrefecture(p.name), ...(p.pota.length ? p.pota.map((q) => potaLabel(q, t)) : [t('map.noPota')])]
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
        // 山頂の位置(SOTA の山頂の点)。コードと山名を添える。文字は右に出し、右端なら左に出す
        const right = x < width - 110
        return (
          <g>
            <path d={`M${x},${y - 7}L${x + 6},${y + 4}L${x - 6},${y + 4}Z`} fill="#111827" />
            <text
              x={right ? x + 9 : x - 9}
              y={y + 3}
              textAnchor={right ? 'start' : 'end'}
              fontSize="10"
              fontWeight="bold"
              fill="#111827"
              stroke="#fff"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {[map.summit, summitNameOf(map)].filter(Boolean).join(' ')}
            </text>
          </g>
        )
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

/** 一覧に出す公園: `JP-1289 丹沢大山県立自然公園`(一部なら、そう添える) */
function parkLine(q: { code: string; name?: string; coverage: 'all' | 'part' }, t: ReturnType<typeof useT>): string {
  const label = [q.code, q.name].filter(Boolean).join(' ')
  return q.coverage === 'all' ? label : t('map.partialSuffix', { label })
}

/**
 * 現在地の答え: その位置で当たるリファレンスだけを 1 行で(`JA/YN-051 JP-0016`)。
 * 中か外かは地図で見えるので、文字にしない。境界付近のものは色だけ変える。ゾーンの外なら、山頂までの距離
 */
function GpsLine({ map, gps }: { map: SummitMap; gps: GpsState }) {
  const t = useT()
  if (gps.status === 'waiting') return <p>{t('map.gpsWaiting')}</p>
  if (gps.status === 'denied') return <p>{t('map.gpsDenied')}</p>
  const { lat, lon, accuracy } = gps.fix
  const where = whereAmI(map, [lon, lat], accuracy)
  const peak = summitOf(map)
  const refs = [
    ...(where.zone !== 'out' ? [{ code: map.summit, near: where.zone === 'near' }] : []),
    ...where.pota.filter((q) => q.side !== 'out').map((q) => ({ code: q.code, near: q.side === 'near' })),
  ]
  return (
    <p role="status" className="font-mono text-xl font-bold">
      {refs.length > 0
        ? refs.map((r) => (
            <span key={r.code} className={`mr-3 ${r.near ? 'text-amber-700 dark:text-amber-300' : 'text-green-700 dark:text-green-400'}`}>
              {r.code}
            </span>
          ))
        : peak && <span className="font-sans text-base">{t('map.toSummit', { dist: distanceLabel(distanceKm(lat, lon, peak[1], peak[0])) })}</span>}
      <span className="font-sans text-sm font-normal text-gray-700 dark:text-gray-300">{t('map.accuracy', { m: String(Math.round(accuracy)) })}</span>
    </p>
  )
}

/**
 * 交信で聞かれたときに読み上げる欄: 山頂のコード・山名・標高と、ゾーンにかかる市区町村ごとの JCC・JCG と当たる POTA。
 * POTA のない市区町村も出す(JCC・JCG は聞かれる)。いまいる市区町村に ▶ を付けて先頭に並べる。
 * 市区町村 1 つを 2 段に分ける(1 段目: JCC・JCG と郡名を含む名前、2 段目: 公園)。長い名前は折り返す
 */
function ReadingCard({ map, here }: { map: SummitMap; here?: string }) {
  const t = useT()
  const alt = summitAltOf(map)
  const munis = [...munisOf(map)].sort((a, b) => Number(b.key === here) - Number(a.key === here))
  const codes = parkCodesOf(map)
  return (
    <div className="text-sm leading-snug">
      <p className="font-bold">
        <span className="font-mono">{map.summit}</span> {summitNameOf(map)}
        {alt !== undefined && <span className="ml-2 font-normal">{alt} m</span>}
      </p>
      {/* 市区町村 1 つを 1 つの枠にし、その JCC・JCG を選ぶと当たる POTA を、見出し付きで枠の中に書く */}
      <ul className="mt-1 space-y-1">
        {munis.map((m) => (
          <li
            key={m.key}
            className={`rounded-lg border-2 px-2 py-1 ${
              m.key === here
                ? 'font-bold border-green-700 bg-green-50 dark:border-green-400 dark:bg-green-950'
                : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            <div className="flex gap-1">
              <span className="w-3 flex-none" aria-hidden="true">{m.key === here ? '▶' : ''}</span>
              <span className="font-mono flex-none">{m.key}</span>
              <span className="min-w-0">{withoutPrefecture(m.name)}</span>
            </div>
            {m.pota.map((q) => (
              <div key={q.code} className="flex gap-2 pl-4">
                <span className="flex-none text-xs font-bold text-gray-700 dark:text-gray-300 pt-0.5">POTA</span>
                {/* 地図の斜線と同じ色の印 */}
                <span className="flex-none w-3 h-3 mt-1 rounded-sm" style={{ background: parkStyleOf(codes, q.code).color }} aria-hidden="true" />
                <span className="min-w-0">{parkLine(q, t)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
