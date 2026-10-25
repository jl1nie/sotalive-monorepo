/**
 * ログのメモ(行の先頭が `#` の行)。上の時刻と運用先の下に、カーソルの位置で有効なもの(その行までで最後のもの)を出す。
 * `#` の行は FLE のコメントなので、出力には入らない。
 *
 * 場所を書き込むときに、日本の山・公園・現在地なら、JCC・JCG をメモとして書く(CW で聞かれたときに見る)。
 * 市区町村は国土地理院の逆ジオコーダー、JCC・JCG は sotaapp2 で引く。日本の外では何も返らないので、書かない。
 */

/** 行の先頭が `#`(全角の `＃` も)の行 */
const MEMO = /^\s*[#＃]/

/** `line`(0 始まり)の行までで、最後のメモ(`#` を除いた本文)。なければ空 */
export function memoAt(text: string, line: number): string {
  const lines = text.split('\n')
  for (let i = Math.min(line, lines.length - 1); i >= 0; i--) {
    if (MEMO.test(lines[i])) return lines[i].replace(MEMO, '').trim()
  }
  return ''
}

import { netFetch } from '@/lib/net'

const GSI = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress'
const JCC_JCG = '/api/v2/locator/jcc-jcg'
/** 書き込みを待たせすぎない(山の上の弱い電波)。2 回の問い合わせを合わせた上限。通信が止まっていれば、待たずに空を返す(net の遮断) */
const TIMEOUT_MS = 5000

interface Options {
  /** テスト用に差し替える */
  fetchImpl?: typeof fetch
}

type Json = Record<string, unknown>
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** sotaapp2 の応答から、メモの本文(`JCC 100103 港区`、`JCC 0101 区 010101 札幌市 中央区`、`JCG 17008 南都留郡 富士河口湖町`)。どちらもなければ空 */
export function memoOf(r: Json): string {
  const jcc = str(r.jccCode)
  const jcg = str(r.jcgCode)
  const muni = str(r.municipality)
  if (jcc) {
    // 政令市は、区の番号も、住所の前に(`JCC 0101 区 010101 札幌市 中央区`)。ラベルは短く(ログの行に収める)
    const ward = str(r.wardCode)
    return [`JCC ${jcc}`, ward && `区 ${ward}`, muni || str(r.jccText)].filter(Boolean).join(' ')
  }
  if (jcg) return [`JCG ${jcg}`, str(r.jcgText), muni].filter(Boolean).join(' ')
  return ''
}

async function getJson(url: string, o: Options, timeoutMs: number): Promise<Json> {
  const res = await netFetch(url, {}, { fetchImpl: o.fetchImpl, timeoutMs })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as Json
}

/**
 * 緯度・経度の JCC・JCG のメモの本文。日本の外、オフライン、通信の誤り、時間切れなら空(書き込みは止めない)
 */
export async function lookupMemo(lat: number, lon: number, o: Options = {}): Promise<string> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return ''
  const deadline = Date.now() + TIMEOUT_MS
  try {
    const geo = await getJson(`${GSI}?${new URLSearchParams({ lat: String(lat), lon: String(lon) })}`, o, TIMEOUT_MS)
    const muni = str((geo.results as Json | undefined)?.muniCd)
    if (!muni) return ''
    // 残りの時間で(1 回目に時間がかかったら、2 回目は短く)
    const r = await getJson(`${JCC_JCG}?${new URLSearchParams({ muni_code: muni })}`, o, Math.max(1000, deadline - Date.now()))
    return memoOf(r)
  } catch {
    return ''
  }
}
