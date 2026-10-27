/**
 * POTA ログのダイアログ(旧版の `potaLog()` と設定画面の POTA ログの欄。docs/myact-next-design.md の 6.6)。
 * ログは sotaapp2 に UUID で保存される(ログインなし)。UUID は、旧版と同じ Cookie(prefs.ts)に持つ。
 * 地図・ポップアップへの反映は、prefs の変更(show_potalog・show_potaactlog・UUID)を、地図の側が購読して行う。
 */
import { h } from './dom.ts'
import type { Api } from './api.ts'
import type { PrefsStore } from './prefs.ts'

export const MESSAGES = {
  noFile: 'ファイルを指定してください',
  invalidFile: '不正なログファイルの形式です。POTA.app からダウンロードした CSV ファイルをアップロードして下さい',
  exportFailed: 'Export に失敗しました',
  keyNotFound: 'キーコードが見つかりません',
  uploaded: (kind: 'activator' | 'hunter') => `${kind === 'activator' ? 'Activator' : 'Hunter'} のログを取り込みました`,
  imported: '共有されたログを取り込みました',
}

type Status = { kind: 'ok' | 'error'; text: string } | null
type Kind = 'activator' | 'hunter'

export interface PotaLogDialogOptions {
  prefs: PrefsStore
  api: Api
  /** 統計を開く(チャートは、段階 5 のスポットと同じ部品で出す) */
  onStats?: () => void
}

export function createPotaLogDialog({ prefs, api, onStats }: PotaLogDialogOptions) {
  let status: Status = null
  let shareKey = ''
  /** 各ログの最終更新('YYYY-MM-DD')。登録なし・無効なら null */
  const lastUpdate: Record<Kind, string | null> = { activator: null, hunter: null }
  const uuidKey = { activator: 'pota_activator_uuid', hunter: 'pota_hunter_uuid' } as const
  const label = { activator: 'Activator', hunter: 'Hunter' } as const

  const showLog = h('input', { type: 'checkbox', id: 'pl-show', 'on:change': () => prefs.set({ show_potalog: showLog.checked }) })
  const radio = (kind: Kind) =>
    h('input', {
      type: 'radio', name: 'pl-kind', id: `pl-${kind}`,
      'on:change': () => prefs.set({ show_potaactlog: kind === 'activator', show_potalog: true }),
    })
  const radios = { activator: radio('activator'), hunter: radio('hunter') }
  const updated = { activator: h('span', { class: 'pl-updated' }), hunter: h('span', { class: 'pl-updated' }) }
  const del = (kind: Kind) => h('button', { type: 'button', class: 'btn btn-outline-danger btn-sm', 'on:click': () => void remove(kind) }, '削除')
  const fileInput = h('input', { type: 'file', id: 'pl-file', accept: '.csv,text/csv', class: 'custom-file-input' })
  const fileName = h('span', {}, 'POTA.app からダウンロードした CSV を選ぶ')
  fileInput.addEventListener('change', () => { fileName.textContent = fileInput.files?.[0]?.name ?? 'POTA.app からダウンロードした CSV を選ぶ' })
  const keyOut = h('span', { class: 'pl-key', 'aria-live': 'polite' })
  const keyIn = h('input', { type: 'text', id: 'pl-import', class: 'form-control form-control-sm', placeholder: '共有キーを入れる', autocomplete: 'off' })
  const statusEl = h('div', { class: 'pl-status', hidden: true })

  const dialog = h('dialog', { class: 'pl-dialog', 'aria-labelledby': 'pl-title' },
    h('div', { class: 'pl-head' },
      h('b', { id: 'pl-title' }, 'POTA ログ'),
      h('span', { class: 'pl-note' }, 'ログは、サーバーに保存されます(ログインは要りません)'),
      h('button', { type: 'button', class: 'pl-close', 'aria-label': '閉じる', 'on:click': () => dialog.close() }, '×'),
    ),
    h('div', { class: 'pl-body' },
      h('section', {},
        h('b', {}, '地図に出すログ'),
        h('label', { for: 'pl-show', class: 'pl-row' }, showLog, ' 地図とポップアップに、POTA ログを反映する(マーカーの色・Activations/QSOs)'),
        h('fieldset', {},
          h('legend', {}, 'どのログを使うか'),
          ...(['activator', 'hunter'] as const).map((kind) =>
            h('div', { class: 'pl-row' }, radios[kind], h('label', { for: `pl-${kind}`, class: 'pl-grow' }, h('b', {}, label[kind]), ' ', updated[kind]), del(kind))),
        ),
      ),
      h('section', {},
        h('b', {}, 'ログをアップロード'),
        h('div', { class: 'pl-row' },
          h('label', { for: 'pl-file', class: 'pl-file pl-grow' }, fileName),
          fileInput,
          h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'on:click': () => void upload() }, 'アップロード'),
        ),
        h('small', { class: 'text-muted' }, 'Activator か Hunter かは、ファイルの中身で自動で分かります。同じ種類は、上書きされます。'),
      ),
      h('section', {},
        h('b', {}, '別の端末と共有'),
        h('div', { class: 'pl-row' },
          h('button', { type: 'button', class: 'btn btn-outline-secondary btn-sm', 'on:click': () => void exportKey() }, '共有キーを作る'),
          keyOut,
        ),
        h('div', { class: 'pl-row' },
          h('label', { for: 'pl-import', class: 'sr-only' }, '共有キー'),
          keyIn,
          h('button', { type: 'button', class: 'btn btn-outline-secondary btn-sm', 'on:click': () => void importKey() }, '取り込む'),
        ),
      ),
      statusEl,
      h('div', { class: 'pl-foot' },
        h('button', { type: 'button', class: 'btn btn-outline-info btn-sm', 'on:click': () => onStats?.() }, '全体の統計を見る'),
        h('button', { type: 'button', class: 'btn btn-secondary btn-sm pl-grow-start', 'on:click': () => dialog.close() }, '閉じる'),
      ),
    ),
  )

  function render() {
    const p = prefs.get()
    showLog.checked = p.show_potalog
    radios.activator.checked = p.show_potaactlog
    radios.hunter.checked = !p.show_potaactlog
    for (const kind of ['activator', 'hunter'] as const) {
      const registered = p[uuidKey[kind]] !== null
      updated[kind].textContent = lastUpdate[kind] ? `${lastUpdate[kind]} 更新` : registered ? '確認中…' : '登録なし'
    }
    keyOut.textContent = shareKey
    statusEl.hidden = status === null
    statusEl.className = `pl-status ${status?.kind === 'error' ? 'pl-error' : 'pl-ok'}`
    statusEl.setAttribute('role', status?.kind === 'error' ? 'alert' : 'status')
    statusEl.textContent = status?.text ?? ''
  }

  /** 開いたときの確認: 登録してある UUID を、サーバーに聞く。無効なら、登録を消す(旧版と同じ) */
  async function check() {
    for (const kind of ['activator', 'hunter'] as const) {
      const uuid = prefs.get()[uuidKey[kind]]
      if (uuid === null) { lastUpdate[kind] = null; continue }
      const info = await api.getLog(uuid)
      if (info?.logId) { lastUpdate[kind] = info.lastUpdate; if (info.logId !== uuid) prefs.set({ [uuidKey[kind]]: info.logId }) }
      else { lastUpdate[kind] = null; prefs.set({ [uuidKey[kind]]: null }) }
    }
    render()
  }

  async function upload() {
    const file = fileInput.files?.[0]
    if (!file) { status = { kind: 'error', text: MESSAGES.noFile }; return render() }
    const p = prefs.get()
    const res = await api.uploadLog(p.pota_activator_uuid, p.pota_hunter_uuid, file)
    if (!res) { status = { kind: 'error', text: MESSAGES.invalidFile }; return render() }
    // アップロードしたログの種類に応じて、その UUID を保存し、そのログの表示に切り替える
    prefs.set({ [uuidKey[res.logKind]]: res.logId, show_potalog: true, show_potaactlog: res.logKind === 'activator' })
    status = { kind: 'ok', text: MESSAGES.uploaded(res.logKind) }
    await check()
  }

  async function remove(kind: Kind) {
    const uuid = prefs.get()[uuidKey[kind]]
    if (uuid === null) return
    const res = await api.deleteLog(uuid)
    if (res) {
      // 消した側の UUID を捨て、もう一方の表示に切り替える
      prefs.set({ [uuidKey[kind]]: null, show_potalog: true, show_potaactlog: kind !== 'activator' })
      status = null
    }
    await check()
  }

  async function exportKey() {
    const p = prefs.get()
    const res = await api.exportShare(p.pota_activator_uuid, p.pota_hunter_uuid)
    if (res) { shareKey = res.share_id; status = null } else status = { kind: 'error', text: MESSAGES.exportFailed }
    render()
  }

  async function importKey() {
    const res = await api.importShare(keyIn.value.trim())
    if (!res) { status = { kind: 'error', text: MESSAGES.keyNotFound }; return render() }
    prefs.set({ pota_activator_uuid: res.activator_logid, pota_hunter_uuid: res.hunter_logid })
    // 旧版と同じ順序: Activator があれば Activator の表示、Hunter があれば Hunter の表示(あとが勝つ)
    if (res.activator_logid !== null) prefs.set({ show_potalog: true, show_potaactlog: true })
    if (res.hunter_logid !== null) prefs.set({ show_potalog: true, show_potaactlog: false })
    status = { kind: 'ok', text: MESSAGES.imported }
    await check()
  }

  return {
    element: dialog,
    open() {
      status = null
      render()
      dialog.showModal()
      void check()
    },
    close: () => dialog.close(),
  }
}

export type PotaLogDialog = ReturnType<typeof createPotaLogDialog>
