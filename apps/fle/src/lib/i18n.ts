import { createContext, useContext } from 'react'

/** 表示言語。設定の `auto` は、端末の言語に従う */
export type Lang = 'ja' | 'en'
export type LangPref = 'auto' | Lang

export function resolveLang(pref: LangPref, navigatorLang: string = navigator.language): Lang {
  if (pref !== 'auto') return pref
  return navigatorLang.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

/** 文面の表。日本語が原本で、英語は同じキーをすべて持つ(型で保証する)。`{name}` は引数で置き換える */
const ja = {
  // ヘッダー
  'header.generate': '生成',
  'header.generateLabel': 'ファイル生成',
  'header.menu': 'メニュー',
  'header.settings': '設定',
  'sheet.close': '閉じる',

  // 入力欄・候補
  'editor.label': 'FLEログ',
  'suggest.label': '補完候補',
  'suggest.command': 'コマンド',
  'suggest.band': 'バンド',
  'suggest.mode': 'モード',
  'suggest.day': '日付',

  // 候補バー
  'bar.openList': 'QSO一覧を開く',
  'bar.confirmLabel': 'この行を確定して次の行へ',
  'bar.confirm': '確定',
  'bar.empty': 'ログを入力してください',

  // QSO一覧
  'list.errorsTitle': '{qsos} QSO / エラー {errors}',
  'list.title': '{qsos} QSO',
  'list.empty': 'まだQSOがありません',
  'list.tapToJump': 'タップでその行へ',

  // メニュー
  'menu.title': 'ログ',
  'menu.place': '新しいログ・場所を設定',
  'menu.openFle': 'FLEログを読み込む',
  'menu.addAdif': 'ADIFを追加',
  'menu.sample': 'サンプルを入れる',
  'menu.clear': 'すべて消す',
  'menu.undo': '直前の内容に戻す',
  'menu.install': 'ホーム画面に追加',
  'menu.installIos': 'ホーム画面に追加するには、Safariの共有ボタンから「ホーム画面に追加」を選びます。',
  'menu.help': 'FLEの書き方',
  'menu.version': 'FLEonline 版 {version}',

  // 通知
  'notice.autosaveFailed': '自動保存できません。ブラウザの設定を確認してください',
  'notice.offlineReady': 'オフラインでも使えます',
  'notice.compileFailed': '解釈に失敗しました',
  'notice.errorsFile': 'エラーのある行があります。エラー内容を書いたファイルを生成しました',
  'notice.generateFailed': 'ファイルを生成できませんでした',
  'notice.loaded': 'ログを読み込みました。メニューから元に戻せます',
  'notice.sampleInserted': 'サンプルを入れました。メニューから元に戻せます',
  'notice.cleared': '消しました。メニューから元に戻せます',

  // 設定
  'settings.title': '設定',
  'settings.theme': '表示テーマ',
  'settings.theme.system': '端末に合わせる',
  'settings.theme.system.hint': '端末の明るい/暗いの設定に従います',
  'settings.theme.light': 'ライト',
  'settings.theme.light.hint': '屋外・日なたで見やすい',
  'settings.theme.dark': 'ダーク',
  'settings.theme.dark.hint': '夜間や暗い場所向け',
  'settings.confirm': '確定の書き方',
  'settings.confirm.intro':
    '緑の候補バーで確定するとき、時刻は必ず書きます。ほかに書くものを選べます。省略したままでも、意味は同じです(バーには、いつも完全な解釈が出ます)。',
  'settings.confirm.rst': 'RST',
  'settings.confirm.rst.hint': '省略したときの 599 / 59 も書きます。4 のような省略形は 549 のように直します',
  'settings.confirm.bandMode': 'バンド・モード',
  'settings.confirm.bandMode.hint':
    '各行に 40m CW のように書きます。設定行で決めていれば、書かなくても同じ意味です',
  'settings.language': '言語 / Language',
  'settings.language.auto': '端末に合わせる / Auto',
  'settings.timezone': '既定のタイムゾーン',
  'settings.timezone.hint':
    '時刻を自動で入れるとき、ログに timezone の指定がなければ、この時間帯で入れて、ログにも timezone の行を書き込みます。',
  'tz.utc': 'UTC(世界標準時)',
  'tz.jst': '(日本標準時)',

  // 場所
  'place.mycall': '自局のコールサイン',
  'place.pota': 'POTA(同じ場所の公園は空白で区切る)',
  'place.grid': 'グリッドロケータ',
  'place.example': '例: {value}',
  'place.newLog': '新しいログ',
  'place.change': '場所の変更',
  'place.write': 'ログに書き込む',
  'place.hintNew': 'ログの先頭に書き込みます。すべて任意です。',
  'place.hintChange': 'カーソルの行から先のQSOに有効です。空にした項目は解除します。',
  'place.offline': 'オフラインです。リファレンスは手入力してください(候補は出ません)。',
  'place.locate': '現在地',
  'place.locateLabel': '現在地からグリッドを入れる',
  'place.nearby': '近くの山・公園',
  'place.searching': '検索中…',
  'place.nearbyOffline': 'オフラインのため、近くの山・公園は出せません。',
  'place.nearbyError': '近くの山・公園を取得できませんでした。',
  'place.nearbyNone': '近くに山・公園が見つかりませんでした。',
  'place.candOffline': 'オフラインのため、候補は出ません(手入力できます)。',
  'place.candError': '候補を取得できませんでした(手入力できます)。',
  'place.candNone': '該当する山・公園がありません。',
  'ref.summit': '山',
  'ref.park': '公園',
  'ref.points': '{n}点',

  // 位置情報
  'geo.unsupported': 'この端末では位置情報を使えません',
  'geo.noGrid': '位置からグリッドを求められませんでした',
  'geo.denied': '位置情報を取得できませんでした。ブラウザの許可を確認してください',

  // 生成前の確認
  'check.title': 'ログに足りない情報',
  'check.write': 'ログに書き込んで生成',
  'check.anyway': 'このまま生成',
  'check.required': '必須',
  'check.recommended': '推奨',
  'check.missing_mycall':
    '自局のコールサインがありません。ADIF と SOTA の CSV で、自局が空になります({qsos}件のQSO)。',
  'check.missing_place': '運用場所(SOTA・POTA・WWFF)がありません。POTA・WWFF の ADIF は作られません。',
  'check.missing_grid': 'グリッドロケータがありません。ADIF の MY_GRIDSQUARE が出ません({qsos}件のQSO)。',
  'check.setPlace': '運用場所を設定する',
  'check.note': '書き込む項目は、ログの先頭に入ります。',

  // 入力欄の形式の誤り
  'field.mycall': 'コールサインの形式が正しくありません',
  'field.sota': 'SOTAのリファレンスの形式が正しくありません(例: JA/TK-001)',
  'field.pota': 'POTAのリファレンスの形式が正しくありません(例: JA-0001)',
  'field.wwff': 'WWFFのリファレンスの形式が正しくありません(例: JAFF-0001)',
  'field.grid': 'グリッドロケータの形式が正しくありません(例: PM95uq)',
} as const

export type MessageKey = keyof typeof ja

const en: Record<MessageKey, string> = {
  'header.generate': 'Export',
  'header.generateLabel': 'Export files',
  'header.menu': 'Menu',
  'header.settings': 'Settings',
  'sheet.close': 'Close',

  'editor.label': 'FLE log',
  'suggest.label': 'Suggestions',
  'suggest.command': 'command',
  'suggest.band': 'band',
  'suggest.mode': 'mode',
  'suggest.day': 'day',

  'bar.openList': 'Open QSO list',
  'bar.confirmLabel': 'Confirm this line and go to the next',
  'bar.confirm': 'Confirm',
  'bar.empty': 'Type your log',

  'list.errorsTitle': '{qsos} QSO / {errors} errors',
  'list.title': '{qsos} QSO',
  'list.empty': 'No QSOs yet',
  'list.tapToJump': 'Tap to go to the line',

  'menu.title': 'Log',
  'menu.place': 'New log / set location',
  'menu.openFle': 'Open an FLE log',
  'menu.addAdif': 'Add ADIF',
  'menu.sample': 'Insert a sample',
  'menu.clear': 'Clear all',
  'menu.undo': 'Restore previous content',
  'menu.install': 'Add to home screen',
  'menu.installIos': 'To add to the home screen, choose "Add to Home Screen" from Safari\'s share button.',
  'menu.help': 'How to write FLE',
  'menu.version': 'FLEonline version {version}',

  'notice.autosaveFailed': 'Cannot autosave. Check your browser settings',
  'notice.offlineReady': 'Ready to use offline',
  'notice.compileFailed': 'Failed to parse the log',
  'notice.errorsFile': 'Some lines have errors. A file describing the errors was generated',
  'notice.generateFailed': 'Could not generate the files',
  'notice.loaded': 'Log loaded. You can undo it from the menu',
  'notice.sampleInserted': 'Sample inserted. You can undo it from the menu',
  'notice.cleared': 'Cleared. You can undo it from the menu',

  'settings.title': 'Settings',
  'settings.theme': 'Theme',
  'settings.theme.system': 'Match device',
  'settings.theme.system.hint': 'Follows the light/dark setting of your device',
  'settings.theme.light': 'Light',
  'settings.theme.light.hint': 'Easy to read outdoors in sunlight',
  'settings.theme.dark': 'Dark',
  'settings.theme.dark.hint': 'For night or dark places',
  'settings.confirm': 'What confirming writes',
  'settings.confirm.intro':
    'When you confirm with the green bar, the time is always written. Choose what else to write. The meaning is the same if you leave them out (the bar always shows the full interpretation).',
  'settings.confirm.rst': 'RST',
  'settings.confirm.rst.hint': 'Also writes the default 599 / 59. A short form such as 4 is rewritten like 549',
  'settings.confirm.bandMode': 'Band and mode',
  'settings.confirm.bandMode.hint':
    'Writes e.g. 40m CW on each line. The meaning is the same if a settings line already sets them',
  'settings.language': '言語 / Language',
  'settings.language.auto': '端末に合わせる / Auto',
  'settings.timezone': 'Default time zone',
  'settings.timezone.hint':
    'When the time is filled in automatically and the log has no timezone line, this zone is used and a timezone line is also written to the log.',
  'tz.utc': 'UTC (universal time)',
  'tz.jst': ' (Japan Standard Time)',

  'place.mycall': 'My callsign',
  'place.pota': 'POTA (separate parks at the same place with spaces)',
  'place.grid': 'Grid locator',
  'place.example': 'e.g. {value}',
  'place.newLog': 'New log',
  'place.change': 'Change location',
  'place.write': 'Write to log',
  'place.hintNew': 'Written at the top of the log. All fields are optional.',
  'place.hintChange': 'Applies to QSOs from the cursor line onward. Empty fields are cleared.',
  'place.offline': 'You are offline. Enter references by hand (no suggestions).',
  'place.locate': 'Here',
  'place.locateLabel': 'Fill in the grid from my location',
  'place.nearby': 'Nearby summits and parks',
  'place.searching': 'Searching…',
  'place.nearbyOffline': 'Offline: nearby summits and parks are unavailable.',
  'place.nearbyError': 'Could not load nearby summits and parks.',
  'place.nearbyNone': 'No summits or parks found nearby.',
  'place.candOffline': 'Offline: no suggestions (you can type it).',
  'place.candError': 'Could not load suggestions (you can type it).',
  'place.candNone': 'No matching summits or parks.',
  'ref.summit': 'Summit',
  'ref.park': 'Park',
  'ref.points': '{n} pts',

  'geo.unsupported': 'Location is not available on this device',
  'geo.noGrid': 'Could not work out a grid from the location',
  'geo.denied': 'Could not get your location. Check the browser permission',

  'check.title': 'Missing information',
  'check.write': 'Write to log and export',
  'check.anyway': 'Export anyway',
  'check.required': 'Required',
  'check.recommended': 'Recommended',
  'check.missing_mycall':
    'No callsign for your station. The station fields in the ADIF and SOTA CSV will be empty ({qsos} QSOs).',
  'check.missing_place': 'No operating location (SOTA / POTA / WWFF). POTA and WWFF ADIF files will not be made.',
  'check.missing_grid': 'No grid locator. MY_GRIDSQUARE will be missing from the ADIF ({qsos} QSOs).',
  'check.setPlace': 'Set the location',
  'check.note': 'Items you enter are written at the top of the log.',

  'field.mycall': 'Not a valid callsign',
  'field.sota': 'Not a valid SOTA reference (e.g. JA/TK-001)',
  'field.pota': 'Not a valid POTA reference (e.g. JA-0001)',
  'field.wwff': 'Not a valid WWFF reference (e.g. JAFF-0001)',
  'field.grid': 'Not a valid grid locator (e.g. PM95uq)',
}

const TABLES: Record<Lang, Record<MessageKey, string>> = { ja, en }

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

export function translator(lang: Lang): Translate {
  const table = TABLES[lang]
  return (key, params) =>
    table[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`))
}

export interface I18n {
  lang: Lang
  t: Translate
}

export const I18nContext = createContext<I18n>({ lang: 'ja', t: translator('ja') })

export function useI18n(): I18n {
  return useContext(I18nContext)
}

export function useT(): Translate {
  return useContext(I18nContext).t
}
