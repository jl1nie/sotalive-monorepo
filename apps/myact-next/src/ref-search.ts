/**
 * 検索ボックス(旧版 `search-ref.js`)。参照のコード・名前を打つと候補を出し、選ぶと、その場所へ動く。
 * 「緯度,経度」(小数)を貼り付けても動く。候補の数が MAX_CANDIDATES を超えたら、出さない(絞り込みを待つ)。
 */
import type { Api, BriefCandidate } from './api.ts'
import { h } from './dom.ts'

export const MAX_CANDIDATES = 300
export const DEBOUNCE_MS = 300

export interface Place {
  code: string
  name: string
  coord: [number, number]
}

/** 「35.1234,139.5678」(空白は 1 つ除く)。旧版と同じく、15 文字以上で、両方が小数のときだけ */
export function parseCoords(text: string): [number, number] | null {
  if (text.length <= 14) return null
  const [a, b] = text.replace(' ', '').split(',')
  if (a === undefined || b === undefined || !/\d+\.\d+/.test(a) || !/\d+\.\d+/.test(b)) return null
  const lat = parseFloat(a)
  const lon = parseFloat(b)
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null
}

/** 入力の最初の語(大文字)が、候補のコードと同じなら、その候補 */
export function matchCandidate(text: string, candidates: BriefCandidate[]): Place | null {
  const first = text.split(' ')[0]?.toUpperCase()
  const c = candidates.find((x) => x.code === first)
  return c ? { code: c.code, name: c.nameJ, coord: [c.lat, c.lon] } : null
}

/** 候補の表示(旧版と同じ: コード + 名前。入力に " があれば、名前を " で囲む) */
export const optionValue = (c: BriefCandidate, text: string) => `${c.code} ${text.includes('"') ? `"${c.nameJ}"` : c.nameJ}`

/** SOTA のコード(JA/KN-006、JA1/…)なら、山のポップアップも開く(旧版 showReference) */
export const isSummitCode = (code: string) => /JA\d*\/.+/.test(code)

export function createRefSearch({ api, done }: { api: Api; done: (p: Place) => void }) {
  const list = h('datalist', { id: 'ref-list' })
  const input = h('input', {
    type: 'search', id: 'ref-search', class: 'ref-search', list: 'ref-list', placeholder: 'Search', 'aria-label': '参照・名前の検索',
    autocomplete: 'off', 'on:input': () => schedule(),
  })
  let candidates: BriefCandidate[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | null = null

  function finish(p: Place) {
    input.value = ''
    list.replaceChildren()
    candidates = []
    done(p)
  }

  async function query() {
    const text = input.value
    if (text.length === 0) return list.replaceChildren()
    const coords = parseCoords(text)
    if (coords) return finish({ code: 'Unknown', name: 'Unknown', coord: coords })
    const hit = matchCandidate(text, candidates)
    if (hit) return finish(hit)
    controller?.abort()
    controller = new AbortController()
    const res = await api.searchBrief(text, controller.signal)
    if (!res || input.value !== text) return
    candidates = res.count < MAX_CANDIDATES ? (res.candidates ?? []) : []
    list.replaceChildren(...candidates.map((c) => h('option', { value: optionValue(c, text) })))
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void query(), DEBOUNCE_MS)
  }
  return { input, list }
}
