import { useT } from '@/lib/i18n'
import { useFieldKeyProps } from '@/hooks/useFieldKeys'

/** メモの入力欄 */
export function MemoField({ id, memo, looking, onChange }: { id: string; memo: string; looking: boolean; onChange: (v: string) => void }) {
  const t = useT()
  // フルキーなら、メモも画面のキーボードで打つ(JCC の番号など)。日本語は 🌐 で OS のキーボードに
  const fieldKeys = useFieldKeyProps()
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
        {...fieldKeys}
        className="input"
      />
      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{t('place.memoHint')}</p>
    </div>
  )
}
