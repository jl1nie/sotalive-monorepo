import { useState } from 'react'
import { Crosshair } from 'lucide-react'
import { gridLocator, type FieldError, type Station } from '@/lib/fle'
import { Sheet } from '@/components/Sheet'

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

const FIELDS = [
  { key: 'mycall', label: '自局のコールサイン', hint: '例: JA1ABC/1', mode: 'text' },
  { key: 'sota', label: 'SOTA', hint: '例: JA/TK-001', mode: 'text' },
  { key: 'pota', label: 'POTA(同じ場所の公園は空白で区切る)', hint: '例: JA-0001 JA-0002', mode: 'text' },
  { key: 'wwff', label: 'WWFF', hint: '例: JAFF-0001', mode: 'text' },
  { key: 'grid', label: 'グリッドロケータ', hint: '例: PM95uq', mode: 'text' },
] as const

type Key = (typeof FIELDS)[number]['key']
type Values = Record<Key, string>

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
  const [values, setValues] = useState<Values>(() => toValues(initial))
  const [errors, setErrors] = useState<FieldError[]>([])
  const [geoMessage, setGeoMessage] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

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

  // 位置情報の取得は画面(端末)の役目。グリッドの計算はコアに任せる
  const locate = () => {
    setGeoMessage(null)
    if (!navigator.geolocation) {
      setGeoMessage('この端末では位置情報を使えません')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const grid = await gridLocator(pos.coords.latitude, pos.coords.longitude)
        if (grid) set('grid', grid)
        else setGeoMessage('位置からグリッドを求められませんでした')
        setLocating(false)
      },
      () => {
        setGeoMessage('位置情報を取得できませんでした。ブラウザの許可を確認してください')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNewLog ? '新しいログ' : '場所の変更'}
      actions={
        <button type="button" onClick={apply} className="btn-success w-full">
          ログに書き込む
        </button>
      }
    >
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
        {isNewLog
          ? 'ログの先頭に書き込みます。すべて任意です。'
          : 'カーソルの行から先のQSOに有効です。空にした項目は解除します。'}
      </p>
      <div className="space-y-3">
        {FIELDS.map((f) => {
          const error = errors.find((e) => e.field === f.key)
          return (
            <div key={f.key}>
              <label htmlFor={`place-${f.key}`} className="label">
                {f.label}
              </label>
              <div className="flex gap-2">
                <input
                  id={`place-${f.key}`}
                  value={values[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.hint}
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
                    aria-label="現在地からグリッドを入れる"
                    className="btn-secondary !px-3 shrink-0"
                  >
                    <Crosshair className="w-5 h-5" />
                    現在地
                  </button>
                )}
              </div>
              {error && (
                <p id={`place-${f.key}-error`} role="alert" className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
                  {error.message}
                </p>
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
    </Sheet>
  )
}
