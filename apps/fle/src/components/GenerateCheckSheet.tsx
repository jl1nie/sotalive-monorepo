import { useState } from 'react'
import { Crosshair } from 'lucide-react'
import type { FieldError, OutputWarning } from '@/lib/fle'
import { useGridLocate } from '@/hooks/useGridLocate'
import { Sheet } from '@/components/Sheet'

interface Props {
  open: boolean
  onClose: () => void
  warnings: OutputWarning[]
  /** 自局のコールサインの初期値(前回のもの) */
  initialCall: string
  /** 入力した自局・グリッドをログの先頭に書き込んで、生成する。誤りがあれば返す */
  onWriteAndGenerate: (values: { mycall: string; grid: string }) => Promise<FieldError[]>
  onGenerateAnyway: () => void
  /** 運用場所は、場所のシートで入力する */
  onOpenPlace: () => void
}

/** 警告の文面(コードごと)。多言語にするときは、ここを言語設定で切り替える */
function warningText(w: OutputWarning): string {
  switch (w.code) {
    case 'missing_mycall':
      return `自局のコールサインがありません。ADIF と SOTA の CSV で、自局が空になります(${w.qsos}件のQSO)。`
    case 'missing_place':
      return '運用場所(SOTA・POTA・WWFF)がありません。POTA・WWFF の ADIF は作られません。'
    case 'missing_grid':
      return `グリッドロケータがありません。ADIF の MY_GRIDSQUARE が出ません(${w.qsos}件のQSO)。`
  }
}

/** ファイルを生成する前に、ログに足りない情報を知らせて、入力を促す。そのまま生成もできる。 */
export function GenerateCheckSheet(props: Props) {
  return props.open ? <CheckForm {...props} /> : null
}

function CheckForm({ onClose, warnings, initialCall, onWriteAndGenerate, onGenerateAnyway, onOpenPlace }: Props) {
  const [mycall, setMycall] = useState(initialCall)
  const [grid, setGrid] = useState('')
  const [errors, setErrors] = useState<FieldError[]>([])
  const { locate, locating, message } = useGridLocate((g) => setGrid(g))

  const needs = (field: OutputWarning['field']) => warnings.some((w) => w.field === field)
  const error = (field: string) => errors.find((e) => e.field === field)?.message

  const writeAndGenerate = async () => {
    setErrors(await onWriteAndGenerate({ mycall: needs('mycall') ? mycall : '', grid: needs('grid') ? grid : '' }))
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="ログに足りない情報"
      actions={
        <>
          <button type="button" onClick={writeAndGenerate} className="btn-success w-full">
            ログに書き込んで生成
          </button>
          <button type="button" onClick={onGenerateAnyway} className="btn-secondary w-full">
            このまま生成
          </button>
        </>
      }
    >
      <ul className="space-y-2 mb-4">
        {warnings.map((w) => (
          <li
            key={w.code}
            className="p-3 rounded-xl border-2 border-amber-700 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100 flex gap-3 items-start"
          >
            <span className="flex-none text-xs font-bold mt-1">
              {w.severity === 'required' ? '必須' : '推奨'}
            </span>
            <span>{warningText(w)}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-3">
        {needs('mycall') && (
          <div>
            <label htmlFor="check-mycall" className="label">
              自局のコールサイン
            </label>
            <input
              id="check-mycall"
              value={mycall}
              onChange={(e) => setMycall(e.target.value)}
              placeholder="例: JA1ABC/1"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error('mycall') ? true : undefined}
              className="input font-mono"
            />
            {error('mycall') && (
              <p role="alert" className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
                {error('mycall')}
              </p>
            )}
          </div>
        )}

        {needs('grid') && (
          <div>
            <label htmlFor="check-grid" className="label">
              グリッドロケータ
            </label>
            <div className="flex gap-2">
              <input
                id="check-grid"
                value={grid}
                onChange={(e) => setGrid(e.target.value)}
                placeholder="例: PM95uq"
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error('grid') ? true : undefined}
                className="input font-mono"
              />
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
            </div>
            {error('grid') && (
              <p role="alert" className="mt-1 text-sm font-semibold text-red-700 dark:text-red-300">
                {error('grid')}
              </p>
            )}
            {message && <p role="status" className="mt-1 text-sm">{message}</p>}
          </div>
        )}

        {needs('place') && (
          <button type="button" onClick={onOpenPlace} className="btn-secondary w-full">
            運用場所を設定する
          </button>
        )}
      </div>
      <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">
        書き込む項目は、ログの先頭に入ります。
      </p>
    </Sheet>
  )
}
