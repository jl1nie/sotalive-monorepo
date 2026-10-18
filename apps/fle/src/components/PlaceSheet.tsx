import { keepFocus } from '@/lib/keepFocus'
import { useState } from 'react'
import { Crosshair } from 'lucide-react'
import type { FieldError, Station } from '@/lib/fle'
import { searchNearby, type RefCandidate, type SearchResult } from '@/lib/reference'
import { useGridLocate } from '@/hooks/useGridLocate'
import { useOnline } from '@/hooks/useOnline'
import { useRefSearch } from '@/hooks/useRefSearch'
import { RefList } from '@/components/RefList'
import { Sheet } from '@/components/Sheet'
import { useT, type MessageKey } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  /** 開いたときの初期値(カーソル位置で有効な自局と場所) */
  initial: Station
  /** まだQSOがない(新しいログの設定)か、途中での場所の変更か */
  isNewLog: boolean
  /** ログに書き込む。誤りがあれば、項目ごとの誤りを返す(空なら書き込めた) */
  onApply: (want: Station) => Promise<FieldError[]>
}

const FIELDS: { key: FieldError['field']; label: MessageKey | null; name?: string; example: string }[] = [
  { key: 'mycall', label: 'place.mycall', example: 'JA1ABC/1' },
  { key: 'sota', label: null, name: 'SOTA', example: 'JA/TK-001' },
  { key: 'pota', label: 'place.pota', example: 'JA-0001 JA-0002' },
  { key: 'wwff', label: null, name: 'WWFF', example: 'JAFF-0001' },
  { key: 'grid', label: 'place.grid', example: 'PM95uq' },
]

type Key = (typeof FIELDS)[number]['key']
type Values = Record<Key, string>

/** 空白・カンマで区切った入力の、いま打っている最後の語 */
const lastToken = (v: string) => v.split(/[\s,]+/).pop() ?? ''

function toValues(s: Station): Values {
  return { mycall: s.mycall, sota: s.sota, pota: s.pota.join(' '), wwff: s.wwff, grid: s.grid }
}

/**
 * 自局のコールサインと運用場所を、ログの指令として書き込む(NewLog)。
 * 開いたときの値は、カーソル位置で有効なもの。書き込んだ行以降のQSOに有効なので、
 * 1つのログに複数の場所を書ける。
 */
export function PlaceSheet(props: Props) {
  // 開くたびに入力欄を初期値から作り直す
  return props.open ? <PlaceForm {...props} /> : null
}

function PlaceForm({ onClose, initial, isNewLog, onApply }: Props) {
  const t = useT()
  const [values, setValues] = useState<Values>(() => toValues(initial))
  const [errors, setErrors] = useState<FieldError[]>([])
  // いま入力している欄(候補を出す欄)と、現在地の近くの一覧
  const [focused, setFocused] = useState<Key | null>(null)
  const [nearby, setNearby] = useState<SearchResult | 'loading' | null>(null)
  const online = useOnline()
  const sotaSearch = useRefSearch('sota', values.sota, focused === 'sota')
  const potaSearch = useRefSearch('pota', lastToken(values.pota), focused === 'pota')

  const set = (key: Key, value: string) => setValues((v) => ({ ...v, [key]: value }))

  const apply = async () => {
    const errs = await onApply({
      mycall: values.mycall,
      sota: values.sota,
      pota: [values.pota],
      wwff: values.wwff,
      grid: values.grid,
    })
    setErrors(errs)
  }

  /** 候補を選ぶ。山は SOTA の欄に。公園は入力中の語を置き換え、対応する WWFF も(空なら)入れる。
   * グリッドも、空なら候補のものを入れる(どれも、あとから編集できる) */
  const pick = (c: RefCandidate) => {
    setValues((v) => ({
      ...v,
      ...(c.kind === 'sota'
        ? { sota: c.code }
        : { pota: v.pota.replace(/[^\s,]*$/, '') + c.code + ' ', wwff: v.wwff || c.wwff || '' }),
      grid: v.grid || c.grid,
    }))
  }

  // 位置情報の取得は画面(端末)の役目。グリッドの計算はコアに任せる。取れたら、近くの山・公園も探す
  const { locate, locating, message: geoMessage } = useGridLocate(async (grid, pos) => {
    set('grid', grid)
    setNearby('loading')
    setNearby(await searchNearby(pos.coords.latitude, pos.coords.longitude))
  })

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNewLog ? t('place.newLog') : t('place.change')}
      actions={
        <button
          type="button"
          onClick={apply}
          // 入力欄のフォーカスを外さない(外れると候補の一覧が閉じてボタンが動き、最初のタップが外れる)
          {...keepFocus}
          className="btn-success w-full"
        >
          {t('place.write')}
        </button>
      }
    >
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
        {isNewLog
          ? t('place.hintNew')
          : t('place.hintChange')}
      </p>
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
              <label htmlFor={`place-${f.key}`} className="label">
                {f.label ? t(f.label) : f.name}
              </label>
              <div className="flex gap-2">
                <input
                  id={`place-${f.key}`}
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  onFocus={() => setFocused(f.key)}
                  onBlur={() => {
                    // 候補をタップすると入力欄の focus が外れることがある。外れた直後に一覧を消すと、タップが空振りするので少し待つ
                    window.setTimeout(() => {
                      if (document.activeElement?.id === `place-${f.key}`) return // 戻ってきた
                      setFocused((k) => (k === f.key ? null : k))
                    }, 300)
                  }}
                  placeholder={t('place.example', { value: f.example })}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `place-${f.key}-error` : undefined}
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
                <p id={`place-${f.key}-error`} role="alert" className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
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
    </Sheet>
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
