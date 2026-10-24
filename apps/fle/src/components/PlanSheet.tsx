import { useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { StationFields } from '@/components/StationFields'
import { MemoField } from '@/components/MemoField'
import { useMemoDraft } from '@/hooks/useMemoDraft'
import { stationPlan, type FieldError } from '@/lib/fle'
import { MAX_PLANS, emptyPlan, newPlanId, planLabel, sortPlans, type Plan } from '@/lib/plans'
import type { MapStatus } from '@/lib/mapStore'
import { toStation, toValues, type Values } from '@/lib/stationValues'
import { useT } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  plans: Plan[]
  /** 保存する。いっぱいで足せなければ false */
  onSave: (plan: Omit<Plan, 'updatedAt'>) => boolean
  onRemove: (id: string) => void
  /** 山頂の地図を開く */
  onOpenMap?: (summit: string) => void
  /** 山頂の地図の保存の状態(予定の一覧に出す。電波のないところでも見られるか) */
  mapStatus?: (summit: string) => MapStatus | null
}

const today = () => new Date().toLocaleDateString('sv-SE')

/** 予定の一覧と編集。行く前に、自局と行き先を登録しておく */
export function PlanSheet(props: Props) {
  return props.open ? <Plans {...props} /> : null
}

function Plans({ onClose, plans, onSave, onRemove, onOpenMap, mapStatus }: Props) {
  const t = useT()
  const [editing, setEditing] = useState<Plan | null>(null)
  const [full, setFull] = useState(false)

  if (editing) {
    return (
      <PlanForm
        plan={editing}
        onOpenMap={onOpenMap}
        onBack={() => setEditing(null)}
        onClose={onClose}
        onSave={(p) => {
          if (!onSave(p)) {
            setFull(true)
            return
          }
          setFull(false)
          setEditing(null)
        }}
        onRemove={(id) => {
          onRemove(id)
          setEditing(null)
        }}
      />
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('plans.title')}
      actions={
        <button
          type="button"
          className="btn-primary w-full"
          onClick={() => setEditing(emptyPlan(newPlanId(), Date.now()))}
        >
          {t('plans.add')}
        </button>
      }
    >
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{t('plans.intro')}</p>
      {full && <p role="alert" className="mb-2 font-semibold text-red-700 dark:text-red-300">{t('plans.full', { n: MAX_PLANS })}</p>}
      {plans.length === 0 ? (
        <p>{t('plans.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {sortPlans(plans, today()).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setEditing(p)}
                className="w-full text-left px-3 py-2 min-h-12 rounded-xl border-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
              >
                <span className="font-bold">{planLabel(p)}</span>
                {p.date && <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{p.date}</span>}
                <MapState status={mapStatus?.(p.sota) ?? null} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

/** 予定の山頂の地図が、端末に保存してあるか(電波のないところでも見られるか) */
function MapState({ status }: { status: MapStatus | null }) {
  const t = useT()
  if (status === null) return null
  const text = { saved: t('plans.mapSaved'), pending: t('plans.mapPending'), none: t('plans.mapNone') }[status]
  return (
    <span
      className={`block text-sm ${status === 'pending' ? 'font-semibold text-amber-800 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}
    >
      {text}
    </span>
  )
}

function PlanForm({
  plan,
  onBack,
  onClose,
  onSave,
  onRemove,
  onOpenMap,
}: {
  plan: Plan
  onOpenMap?: (summit: string) => void
  onBack: () => void
  onClose: () => void
  onSave: (plan: Omit<Plan, 'updatedAt'>) => void
  onRemove: (id: string) => void
}) {
  const t = useT()
  const [values, setValues] = useState<Values>(() => toValues(plan))
  const [title, setTitle] = useState(plan.title)
  const [date, setDate] = useState(plan.date)
  const [rig, setRig] = useState(plan.rig)
  const [qslmsg, setQslmsg] = useState(plan.qslmsg)
  const memo = useMemoDraft(plan.memo ?? '')
  const [errors, setErrors] = useState<FieldError[]>([])

  const save = async () => {
    // 自局と場所は、ログに書くときと同じ規則で確かめる(空の項目は、書かないだけ)
    const checked = await stationPlan('', 0, toStation(values))
    setErrors(checked.errors)
    if (checked.errors.length > 0) return
    const s = toStation(values)
    onSave({
      id: plan.id,
      title: title.trim(),
      date,
      mycall: s.mycall.trim().toUpperCase(),
      sota: s.sota.trim().toUpperCase(),
      pota: s.pota.join(' ').split(/[\s,]+/).filter(Boolean).map((x) => x.toUpperCase()),
      wwff: s.wwff.trim().toUpperCase(),
      grid: s.grid.trim().toUpperCase(),
      rig: rig.trim().replace(/%/g, ''),
      qslmsg: qslmsg.trim(),
      memo: memo.memo.trim(),
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('plans.edit')}
      closeLabel={t('sheet.cancel')}
      actions={
        <>
          <button type="button" onClick={save} className="btn-success w-full">
            {t('plans.save')}
          </button>
          <button type="button" onClick={onBack} className="btn-secondary w-full">
            {t('plans.back')}
          </button>
          <button type="button" onClick={() => onRemove(plan.id)} className="btn-secondary w-full">
            {t('plans.delete')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="plan-title" className="label">{t('plans.name')}</label>
          <input id="plan-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('plans.namePlaceholder')} maxLength={60} className="input" />
        </div>
        <div>
          <label htmlFor="plan-date" className="label">{t('plans.date')}</label>
          <input id="plan-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        </div>
        <StationFields values={values} onChange={setValues} errors={errors} idPrefix="plan" onPlace={memo.lookup} onMap={onOpenMap} />
        <MemoField id="plan-memo" memo={memo.memo} looking={memo.looking} onChange={memo.edit} />
        <div>
          <label htmlFor="plan-rig" className="label">{t('plans.rig')}</label>
          <input id="plan-rig" value={rig} onChange={(e) => setRig(e.target.value)} maxLength={60} autoCorrect="off" spellCheck={false} className="input font-mono" />
        </div>
        <div>
          <label htmlFor="plan-qslmsg" className="label">{t('plans.qslmsg')}</label>
          <input id="plan-qslmsg" value={qslmsg} onChange={(e) => setQslmsg(e.target.value)} maxLength={200} className="input" />
        </div>
      </div>
    </Sheet>
  )
}
