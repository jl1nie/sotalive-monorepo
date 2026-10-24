import { useEffect, useRef, useState } from 'react'
import { Crosshair } from 'lucide-react'
import type { FieldError } from '@/lib/fle'
import type { Values } from '@/lib/stationValues'
import { searchNearby, type RefCandidate, type SearchResult } from '@/lib/reference'
import { useGridLocate } from '@/hooks/useGridLocate'
import { useOnline } from '@/hooks/useOnline'
import { useRefSearch } from '@/hooks/useRefSearch'
import { RefList } from '@/components/RefList'
import { useFieldKeyProps } from '@/hooks/useFieldKeys'
import { useT, type MessageKey } from '@/lib/i18n'

type Key = FieldError['field']

const FIELDS: { key: Key; label: MessageKey | null; name?: string; example: string }[] = [
  { key: 'mycall', label: 'place.mycall', example: 'JA1ABC/1' },
  { key: 'sota', label: null, name: 'SOTA', example: 'JA/TK-001' },
  { key: 'pota', label: 'place.pota', example: 'JP-0001 JP-0002' },
  { key: 'wwff', label: null, name: 'WWFF', example: 'JAFF-0001' },
  { key: 'grid', label: 'place.grid', example: 'PM95uq' },
]

/** 空白・カンマで区切った入力の、いま打っている最後の語 */
const lastToken = (v: string) => v.split(/[\s,]+/).pop() ?? ''

/** 自局と運用場所の入力欄(山・公園の候補検索、現在地からのグリッド・近くの山と公園を含む)。場所のシートと、予定の編集で使う */
export function StationFields({
  values,
  onChange,
  errors,
  idPrefix = 'place',
  onPlace,
}: {
  values: Values
  onChange: (values: Values) => void
  errors: FieldError[]
  idPrefix?: string
  /**
   * 山・公園を候補から選んだとき、現在地が取れたときに、その緯度・経度を知らせる(JCC・JCG のメモを引く)。
   * 候補を押さずに、打った番号が候補と同じになったときは `typed`(手で書いたメモは上書きしない)
   */
  onPlace?: (pos: { lat: number; lon: number }, typed?: boolean) => void
}) {
  const t = useT()
  // いま入力している欄(候補を出す欄)と、現在地の近くの一覧
  const [focused, setFocused] = useState<Key | null>(null)
  const [nearby, setNearby] = useState<SearchResult | 'loading' | null>(null)
  const online = useOnline()
  const fieldKeys = useFieldKeyProps()
  const sotaSearch = useRefSearch('sota', values.sota, focused === 'sota')
  const potaSearch = useRefSearch('pota', lastToken(values.pota), focused === 'pota')

  const set = (key: Key, value: string) => onChange({ ...values, [key]: value })

  // 打った番号が候補と同じなら、選んだときと同じく JCC・JCG を引く(候補を押さなくても、メモが番号に連動する)。
  // 同じ番号では、1回だけ
  const notified = useRef('')
  const typedHit = (r: SearchResult | null, code: string) =>
    r?.status === 'ok' ? r.items.find((c) => c.code.toUpperCase() === code.trim().toUpperCase()) : undefined
  const hit = typedHit(sotaSearch.result, values.sota) ?? typedHit(potaSearch.result, lastToken(values.pota))
  useEffect(() => {
    if (!hit || notified.current === hit.code) return
    notified.current = hit.code
    if (Number.isFinite(hit.lat) && Number.isFinite(hit.lon)) onPlace?.({ lat: hit.lat, lon: hit.lon }, true)
  }, [hit, onPlace])

  /** 候補を選ぶ。山は SOTA の欄に。公園は入力中の語を置き換え、対応する WWFF も(空なら)入れる。
   * グリッドも、空なら候補のものを入れる(どれも、あとから編集できる) */
  const pick = (c: RefCandidate) => {
    notified.current = c.code
    onChange({
      ...values,
      ...(c.kind === 'sota'
        ? { sota: c.code }
        : { pota: values.pota.replace(/[^\s,]*$/, '') + c.code + ' ', wwff: values.wwff || c.wwff || '' }),
      grid: values.grid || c.grid,
    })
    if (Number.isFinite(c.lat) && Number.isFinite(c.lon)) onPlace?.({ lat: c.lat, lon: c.lon })
  }

  // 位置情報の取得は画面(端末)の役目。グリッドの計算はコアに任せる。取れたら、近くの山・公園も探す
  const { locate, locating, message: geoMessage } = useGridLocate(async (grid, pos) => {
    onChange({ ...values, grid })
    onPlace?.({ lat: pos.coords.latitude, lon: pos.coords.longitude })
    setNearby('loading')
    setNearby(await searchNearby(pos.coords.latitude, pos.coords.longitude))
  })

  return (
    <>
      {!online && (
        <p role="status" className="text-sm font-semibold mb-3">
          {t('place.offline')}
        </p>
      )}
      <div className="space-y-3">
        {FIELDS.map((f) => {
          const error = errors.find((e) => e.field === f.key)
          return (
            <div key={f.key}>
              <label htmlFor={`${idPrefix}-${f.key}`} className="label">
                {f.label ? t(f.label) : f.name}
              </label>
              <div className="flex gap-2">
                <input
                  id={`${idPrefix}-${f.key}`}
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  onFocus={() => setFocused(f.key)}
                  onBlur={() => {
                    // 候補をタップすると入力欄の focus が外れることがある。外れた直後に一覧を消すと、タップが空振りするので少し待つ
                    window.setTimeout(() => {
                      if (document.activeElement?.id === `${idPrefix}-${f.key}`) return // 戻ってきた
                      setFocused((k) => (k === f.key ? null : k))
                    }, 300)
                  }}
                  placeholder={t('place.example', { value: f.example })}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  {...fieldKeys}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${idPrefix}-${f.key}-error` : undefined}
                  className="input font-mono"
                />
                {f.key === 'grid' && (
                  <button
                    type="button"
                    onClick={locate}
                    disabled={locating}
                    aria-label={t('place.locateLabel')}
                    className="btn-secondary !px-3 shrink-0"
                  >
                    <Crosshair className="w-5 h-5" />
                    {t('place.locate')}
                  </button>
                )}
              </div>
              {error && (
                <p id={`${idPrefix}-${f.key}-error`} role="alert" className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
                  {t(`field.${error.field}`)}
                </p>
              )}
              {(f.key === 'sota' || f.key === 'pota') && (
                <Suggestions search={f.key === 'sota' ? sotaSearch : potaSearch} onPick={pick} />
              )}
              {f.key === 'grid' && geoMessage && (
                <p role="status" className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  {geoMessage}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {nearby && (
        <section className="mt-4" aria-label={t('place.nearby')}>
          <h3 className="label">{t('place.nearby')}</h3>
          {nearby === 'loading' ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">{t('place.searching')}</p>
          ) : nearby.status === 'offline' ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">{t('place.nearbyOffline')}</p>
          ) : nearby.status === 'error' ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">{t('place.nearbyError')}</p>
          ) : nearby.items.length === 0 ? (
            <p className="text-sm text-gray-700 dark:text-gray-300">{t('place.nearbyNone')}</p>
          ) : (
            <RefList items={nearby.items} onPick={pick} showKind />
          )}
        </section>
      )}
</>
  )
}

/** 入力中の語に対する候補(検索中・なし・オフラインなどの表示も含む) */
function Suggestions({
  search,
  onPick,
}: {
  search: ReturnType<typeof useRefSearch>
  onPick: (c: RefCandidate) => void
}) {
  const t = useT()
  if (!search.active) return null
  const note = (text: string) => (
    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{text}</p>
  )
  if (search.loading) return note(t('place.searching'))
  const r = search.result
  if (!r) return null
  if (r.status === 'offline') return note(t('place.candOffline'))
  if (r.status === 'error') return note(t('place.candError'))
  if (r.items.length === 0) return note(t('place.candNone'))
  return <RefList items={r.items} onPick={onPick} />
}
