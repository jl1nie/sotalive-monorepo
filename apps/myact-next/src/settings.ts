/**
 * 設定の画面(旧版の Preferences)。変更は、すぐ保存・反映する(旧版は、押すたびに clickPrefs)。保存先は旧版と同じ Cookie。
 * ActPaddle の CALL・メッセージなどは、ActPaddle のダイアログで設定する(ここは、使うかどうかだけ)。
 */
import { h, type Child } from './dom.ts'
import type { Prefs, PrefsStore } from './prefs.ts'

type BoolKey = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs]

export interface SettingsOptions {
  prefs: PrefsStore
  /** POTA ログのダイアログを開く */
  openPotaLog: () => void
}

export function createSettingsDialog({ prefs, openPotaLog }: SettingsOptions) {
  const inputs: Partial<Record<BoolKey, HTMLInputElement>> = {}

  const check = (key: BoolKey, label: string, note?: string): HTMLElement => {
    const input = h('input', { type: 'checkbox', id: key, 'on:change': () => prefs.set({ [key]: input.checked } as Partial<Prefs>) })
    inputs[key] = input
    return h('label', { class: 'st-check' }, input, h('span', {}, label, note ? h('small', { class: 'st-note' }, note) : null))
  }
  const section = (title: string, ...children: Child[]) => h('section', { class: 'st-section' }, h('b', {}, title), ...children)

  const threshold = h('input', { type: 'range', id: 'zoom_threshold', min: 7, max: 12, step: 1, class: 'st-range', 'aria-describedby': 'zoom_threshold_value' })
  const thresholdValue = h('output', { id: 'zoom_threshold_value', for: 'zoom_threshold' })
  threshold.addEventListener('input', () => {
    thresholdValue.textContent = threshold.value
    prefs.set({ zoom_threshold: Number(threshold.value) })
  })

  const dialog = h('dialog', { class: 'pl-dialog st-dialog', id: 'settings', 'aria-labelledby': 'st-title' },
    h('div', { class: 'pl-head' },
      h('b', { id: 'st-title' }, '設定'),
      h('span', { class: 'pl-note' }, 'この端末に保存します(Cookie。旧版と同じ名前なので、そのまま引き継ぎます)'),
      h('button', { type: 'button', class: 'pl-close', 'aria-label': '閉じる', 'on:click': () => dialog.close() }, '×'),
    ),
    h('div', { class: 'pl-body' },
      section('表示対象',
        check('sota_ref', 'SOTA'), check('pota_ref', 'POTA'), check('jaff_ref', 'JAFF'),
        check('display_area', '自然公園の領域を表示'), check('aprs_track', 'SOTA APRS')),
      section('マーカー',
        h('div', { class: 'st-slider' }, h('label', { for: 'zoom_threshold' }, '表示する数: 多'), threshold, h('span', {}, '少'), thresholdValue),
        check('popup_permanent', '公園名を常に表示')),
      section('リンク',
        check('link_googlemap', 'Google マップにリンク(オフは、地理院地図)'),
        check('display_mapcode', 'MAPCODE を表示', '(「マップコード」および「MAPCODE」は㈱デンソーの登録商標です)')),
      section('POTA ログ・ActPaddle',
        h('div', { class: 'st-row' }, h('button', { type: 'button', class: 'btn btn-success', 'on:click': () => { dialog.close(); openPotaLog() } }, 'POTA ログを開く')),
        check('enable_emulation', 'パドルエミュレータ(ActPaddle)を使う', 'ポップアップに、ボタンを出します。CALL・メッセージ・送り方は、そのダイアログで設定します'),
      ),
    ),
  )

  /** 開くたびに、保存してある値を入れる(ほかで変わっていても、合わせる) */
  function open() {
    const p = prefs.get()
    for (const [k, el] of Object.entries(inputs) as [BoolKey, HTMLInputElement][]) el.checked = p[k]
    threshold.value = String(p.zoom_threshold)
    thresholdValue.textContent = threshold.value
    if (!dialog.open) dialog.showModal()
  }
  return { element: dialog, open }
}
export type SettingsDialog = ReturnType<typeof createSettingsDialog>
