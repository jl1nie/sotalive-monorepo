import { useT } from '@/lib/i18n'

/** メモの入力欄 */
export function MemoField({ id, memo, looking, onChange }: { id: string; memo: string; looking: boolean; onChange: (v: string) => void }) {
  const t = useT()
  return (
    <div>
      <label htmlFor={id} className="label">
        {t('place.memo')}
      </label>
      <input
        id={id}
        value={memo}
        onChange={(e) => onChange(e.target.value)}
        placeholder={looking ? t('place.memoLooking') : t('place.memoExample')}
        maxLength={200}
        className="input"
      />
      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{t('place.memoHint')}</p>
    </div>
  )
}
