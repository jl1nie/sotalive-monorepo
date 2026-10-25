import {
  buildTemplate,
  HAMLOG_ITEMS,
  HAMLOG_PRESETS,
  matchPreset,
  parseTemplate,
  type HamlogColumns,
  type HamlogItem,
  type HamlogPresetId,
} from '@/lib/hamlog'
import { HAMLOG_COLUMN_MAX } from '@/hooks/useSettings'
import { useT, type MessageKey } from '@/lib/i18n'

interface Props {
  value: HamlogColumns
  onChange: (value: HamlogColumns) => void
}

const COLUMNS: { key: keyof HamlogColumns; label: string }[] = [
  { key: 'qth', label: 'QTH' },
  { key: 'rmks1', label: 'Rmks1' },
  { key: 'rmks2', label: 'Rmks2' },
]

const ITEM_LABEL: Record<HamlogItem, MessageKey> = {
  rmks: 'settings.hamlog.item.rmks',
  hisref: 'settings.hamlog.item.hisref',
  myref: 'settings.hamlog.item.myref',
  memo: 'settings.hamlog.item.memo',
  qsl: 'settings.hamlog.item.qsl',
  rig: 'settings.hamlog.item.rig',
}

const ITEM_HINT: Record<HamlogItem, MessageKey> = {
  rmks: 'settings.hamlog.rmks',
  hisref: 'settings.hamlog.hisref',
  myref: 'settings.hamlog.myref',
  memo: 'settings.hamlog.memo',
  qsl: 'settings.hamlog.qslmsg',
  rig: 'settings.hamlog.rig',
}

const PRESET_LABEL: Record<HamlogPresetId, { label: MessageKey; hint: MessageKey }> = {
  classic: { label: 'settings.hamlog.preset.classic', hint: 'settings.hamlog.preset.classic.hint' },
  memoRmks1: { label: 'settings.hamlog.preset.memoRmks1', hint: 'settings.hamlog.preset.memoRmks1.hint' },
}

/**
 * HAMLOG の QTH・Rmks1・Rmks2 の欄に、何を書くか。プリセットを選ぶか、欄ごとに項目を選ぶ。
 * 保存は書式の文字列のまま。項目で表せない書式(以前に手で書いたもの)は、その欄だけ文字で見せる
 */
export function HamlogColumnsSection({ value, onChange }: Props) {
  const t = useT()
  const preset = matchPreset(value)
  return (
    <fieldset className="space-y-3">
      <legend className="label">{t('settings.hamlog')}</legend>

      <div className="space-y-2">
        {HAMLOG_PRESETS.map(({ id, columns }) => (
          <label
            key={id}
            className={`flex items-start gap-3 p-3 min-h-14 rounded-xl border-2 cursor-pointer ${
              preset === id
                ? 'border-primary-700 bg-primary-50 dark:border-primary-400 dark:bg-gray-800'
                : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            <input
              type="radio"
              name="hamlogPreset"
              checked={preset === id}
              onChange={() => onChange(columns)}
              className="mt-1 w-5 h-5 accent-primary-700"
            />
            <span>
              <span className="block font-semibold">{t(PRESET_LABEL[id].label)}</span>
              <span className="block text-sm text-gray-700 dark:text-gray-300">{t(PRESET_LABEL[id].hint)}</span>
            </span>
          </label>
        ))}
        {preset === null && <p className="text-sm font-bold text-primary-700 dark:text-primary-300">{t('settings.hamlog.custom')}</p>}
      </div>

      {COLUMNS.map(({ key, label }) => {
        const selected = parseTemplate(value[key])
        return (
          <div key={key} className="space-y-1">
            <div className="font-semibold">{label}</div>
            {selected === null ? (
              // 項目で表せない書式(手で書いたもの)。そのまま文字で直せる。項目から選び直すには、空にする
              <>
                <input
                  aria-label={label}
                  value={value[key]}
                  maxLength={HAMLOG_COLUMN_MAX}
                  onChange={(e) => onChange({ ...value, [key]: e.target.value })}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  className="input font-mono"
                />
                <p className="text-sm text-gray-700 dark:text-gray-300">{t('settings.hamlog.free')}</p>
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                {HAMLOG_ITEMS.map(({ item }) => {
                  const on = selected.includes(item)
                  return (
                    <label
                      key={item}
                      title={t(ITEM_HINT[item])}
                      className={`flex items-center gap-2 px-3 min-h-10 rounded-xl border-2 cursor-pointer ${
                        on
                          ? 'border-primary-700 bg-primary-50 dark:border-primary-400 dark:bg-gray-800'
                          : 'border-gray-300 dark:border-gray-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          onChange({
                            ...value,
                            [key]: buildTemplate(e.target.checked ? [...selected, item] : selected.filter((x) => x !== item)),
                          })
                        }
                        className="w-4 h-4 accent-primary-700"
                      />
                      <span className="text-sm font-semibold">{t(ITEM_LABEL[item])}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
        {HAMLOG_ITEMS.map(({ item }) => (
          <li key={item}>
            <span className="font-bold">{t(ITEM_LABEL[item])}</span>: {t(ITEM_HINT[item])}
          </li>
        ))}
      </ul>
      <p className="text-sm text-gray-700 dark:text-gray-300">{t('settings.hamlog.hint')}</p>
    </fieldset>
  )
}
