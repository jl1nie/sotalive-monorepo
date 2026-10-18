import { keepFocus } from '@/lib/keepFocus'
import { useState } from 'react'
import type { FieldError, Station } from '@/lib/fle'
import { Sheet } from '@/components/Sheet'
import { StationFields } from '@/components/StationFields'
import { toStation, toValues, type Values } from '@/lib/stationValues'
import { extrasOf, type PlanExtras } from '@/lib/planApply'
import { planLabel, sortPlans, type Plan } from '@/lib/plans'
import { useT } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  /** 開いたときの初期値(カーソル位置で有効な自局と場所) */
  initial: Station
  /** まだQSOがない(新しいログの設定)か、途中での場所の変更か */
  isNewLog: boolean
  /** ログに書き込む。誤りがあれば、項目ごとの誤りを返す(空なら書き込めた) */
  onApply: (want: Station, extras?: PlanExtras) => Promise<FieldError[]>
  /** 登録した予定(選ぶと入力欄に入る) */
  plans?: Plan[]
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

function PlaceForm({ onClose, initial, isNewLog, onApply, plans = [] }: Props) {
  const t = useT()
  const [values, setValues] = useState<Values>(() => toValues(initial))
  const [errors, setErrors] = useState<FieldError[]>([])
  const [extras, setExtras] = useState<PlanExtras | null>(null)

  const apply = async () => {
    const errs = await onApply(toStation(values), extras ?? undefined)
    setErrors(errs)
  }

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
        {isNewLog ? t('place.hintNew') : t('place.hintChange')}
      </p>
      {plans.length > 0 && (
        <section className="mb-3" aria-label={t('plans.use')}>
          <h3 className="label">{t('plans.use')}</h3>
          <ul className="space-y-1">
            {sortPlans(plans, new Date().toLocaleDateString('sv-SE')).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setValues(toValues({ mycall: p.mycall, sota: p.sota, pota: p.pota, wwff: p.wwff, grid: p.grid }))
                    setExtras(extrasOf(p))
                    setErrors([])
                  }}
                  className="w-full text-left px-3 py-2 min-h-12 rounded-xl border-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                >
                  <span className="font-bold">{planLabel(p)}</span>
                  {p.date && <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{p.date}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {extras && <p className="mb-3 text-sm">{t('plans.usedNote', { name: extras.name })}</p>}
      <StationFields values={values} onChange={setValues} errors={errors} />
    </Sheet>
  )
}
