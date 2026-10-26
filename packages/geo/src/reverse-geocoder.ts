/**
 * 逆ジオコーダー(緯度経度 → 住所・JCC/JCG・標高)。旧版の `revgeocoder.js` の移植。
 *
 * 国土地理院の 2 つの API(住所・標高)は、**利用者のブラウザーから直接呼ぶ**。
 * アクセス元を利用者ごとに分散するためで、バックエンド(sotaapp2)にまとめない
 * (全員のリクエストが 1 つの IP から国土地理院に出て、制限の対象になる)。
 * バックエンドを通るのは、自治体コード → JCC/JCG の表検索(`/locator/jcc-jcg`)だけ。
 */
import { maidenhead } from './maidenhead.ts'

export interface GeoOk {
  kind: 'ok'
  jccCode: string | null
  wardCode: string | null
  jcgCode: string | null
  hamlogCode: string | null
  jcgText: string | null
  prefecture: string
  /** 市区町村 + 大字(国土地理院の lv01Nm) */
  municipality: string
  maidenhead: string
  /** `elevation: true` のときだけ */
  elevation?: number | string
  hsrc?: string
}
/** 日本の外(自治体がない・標高がない) */
export interface GeoOutside {
  kind: 'outside'
  maidenhead: string
}
/** 通信の失敗・サーバーの異常。圏外とは別。キャッシュしない */
export interface GeoError {
  kind: 'error'
  maidenhead: string
}
export type GeoResult = GeoOk | GeoOutside | GeoError

export interface ReverseGeocoderOptions {
  fetch?: typeof fetch
  /** 国土地理院の逆ジオコーダー */
  gsiAddress?: string
  /** 国土地理院の標高 */
  gsiElevation?: string
  /** 自治体コード → JCC/JCG(sotaapp2) */
  muni?: string
  /** キャッシュの件数 */
  cacheSize?: number
}

const DEFAULTS = {
  gsiAddress: 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress',
  gsiElevation: 'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php',
  muni: 'https://sotaapp2.sotalive.net/api/v2/locator/jcc-jcg',
  cacheSize: 16,
}

interface GsiAddress {
  results?: { muniCd?: string; lv01Nm?: string }
}
interface Muni {
  muniCode?: number
  prefecture?: string
  municipality?: string
  jccCode?: string | null
  wardCode?: string | null
  jcgCode?: string | null
  hamlogCode?: string | null
  jcgText?: string | null
  maidenhead?: string
}
interface Elevation {
  elevation: number | string
  hsrc?: string
}

export function createReverseGeocoder(options: ReverseGeocoderOptions = {}) {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init))
  const gsiAddress = options.gsiAddress ?? DEFAULTS.gsiAddress
  const gsiElevation = options.gsiElevation ?? DEFAULTS.gsiElevation
  const muniEndpoint = options.muni ?? DEFAULTS.muni
  const cacheSize = options.cacheSize ?? DEFAULTS.cacheSize
  const cache = new Map<string, Promise<GeoResult>>()

  async function getJson<T>(url: string): Promise<T> {
    const res = await doFetch(url)
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    return (await res.json()) as T
  }

  async function lookup(lat: number, lng: number, elevation: boolean): Promise<GeoResult> {
    const pos = `?lat=${lat}&lon=${lng}`
    // 標高は並列で取る。住所が圏外のとき、標高の失敗は見ない(unhandled にしない)
    const elevationPromise = elevation
      ? getJson<Elevation>(`${gsiElevation}${pos}&outtype=JSON`).catch(() => null)
      : null
    try {
      const address = await getJson<GsiAddress>(`${gsiAddress}${pos}`)
      const muniCd = address.results?.muniCd
      const muniRes = await doFetch(`${muniEndpoint}${pos}${muniCd ? `&muni_code=${muniCd}` : ''}`)
      if (!muniRes.ok && muniCd) throw new Error(`${muniRes.status} ${muniEndpoint}`)
      const muni: Muni = muniRes.ok ? ((await muniRes.json()) as Muni) : {}
      if (!muni.muniCode) {
        return { kind: 'outside', maidenhead: muni.maidenhead || maidenhead(lat, lng) }
      }
      const lv01Nm = address.results?.lv01Nm
      const result: GeoOk = {
        kind: 'ok',
        jccCode: muni.jccCode ?? null,
        wardCode: muni.wardCode ?? null,
        jcgCode: muni.jcgCode ?? null,
        hamlogCode: muni.hamlogCode ?? null,
        jcgText: muni.jcgText ?? null,
        prefecture: muni.prefecture ?? '',
        municipality: (muni.municipality ?? '') + (lv01Nm && lv01Nm !== '−' ? lv01Nm : ''),
        maidenhead: muni.maidenhead || maidenhead(lat, lng),
      }
      if (elevationPromise) {
        const elev = await elevationPromise
        if (!elev) throw new Error(`elevation ${gsiElevation}`)
        if (elev.elevation === '-----') {
          return { kind: 'outside', maidenhead: result.maidenhead }
        }
        result.elevation = elev.elevation
        result.hsrc = elev.hsrc
      }
      return result
    } catch (e) {
      console.error('reverseGeocode:', e)
      return { kind: 'error', maidenhead: maidenhead(lat, lng) }
    }
  }

  /** 同じ座標・同じ条件の結果と、実行中の問い合わせは使い回す。`error` はキャッシュしない */
  return async function reverseGeocode(
    lat: number,
    lng: number,
    { elevation = false }: { elevation?: boolean } = {},
  ): Promise<GeoResult> {
    const key = `${lat},${lng},${elevation}`
    const cached = cache.get(key)
    if (cached) return cached
    if (cache.size >= cacheSize) cache.delete(cache.keys().next().value as string)
    const promise = lookup(lat, lng, elevation)
    cache.set(key, promise)
    const result = await promise
    if (result.kind === 'error' && cache.get(key) === promise) cache.delete(key)
    return result
  }
}

/** 既定の設定(本番の API)で使うもの */
export const reverseGeocode = createReverseGeocoder()
