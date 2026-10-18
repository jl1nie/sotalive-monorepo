// Translations for Japanese and English

export const translations = {
  ja: {
    // Header
    qthButton: '現在位置を調べる',
    spotsButton: '最新スポットを表示',
    settingsButton: '設定',
    searchPlaceholder: 'リファレンスを検索...',

    // Settings Modal
    settings: '設定',
    display: '表示対象',
    sotaReference: 'SOTA',
    potaReference: 'POTA',
    jaffReference: 'JAFF',
    potaJaffPolygon: '自然公園の領域を表示',
    aprsTrack: 'SOTA APRS',
    activationZone: 'アクティベーションゾーン',

    marker: 'マーカー',
    permanentPopup: 'ポップアップ常時表示',
    googleMapsLink: 'Google Mapsリンク',
    displayMapcode: 'マップコード表示',
    zoomThreshold: 'ズーム閾値',

    spots: 'スポット',
    spotPeriod: '表示期間',
    hours: '時間',
    groupByCallsign: 'コールサインでグループ化',

    potaLog: 'POTAログ',
    showHunterLog: 'ハンターログ表示',
    showActivatorLog: 'アクティベーターログ表示',
    hunterUuid: 'ハンターUUID',
    activatorUuid: 'アクティベーターUUID',
    enterUuid: 'UUIDを入力',

    language: '言語',
    japanese: '日本語',
    english: 'English',

    resetToDefaults: '初期設定に戻す',
    close: '閉じる',

    // Popup
    loading: '読み込み中...',
    elevation: '標高',
    activations: 'Activations',
    lastActivation: 'Last Activation',
    position: '位置',

    // Spots
    noSpots: 'スポットがありません',
    spotCount: '件',
  },
  en: {
    // Header
    qthButton: 'Get current location',
    spotsButton: 'Show latest spots',
    settingsButton: 'Settings',
    searchPlaceholder: 'Search reference...',

    // Settings Modal
    settings: 'Settings',
    display: 'Display',
    sotaReference: 'SOTA',
    potaReference: 'POTA',
    jaffReference: 'JAFF',
    potaJaffPolygon: 'POTA/JAFF Polygon Area',
    aprsTrack: 'SOTA APRS',
    activationZone: 'Activation Zone Overlay',

    marker: 'Marker',
    permanentPopup: 'Permanent Popup',
    googleMapsLink: 'Google Maps Link',
    displayMapcode: 'Display MapCode',
    zoomThreshold: 'Zoom Threshold',

    spots: 'Spots',
    spotPeriod: 'Spot Period',
    hours: 'hours',
    groupByCallsign: 'Group by Callsign',

    potaLog: 'POTA Log',
    showHunterLog: 'Show Hunter Log',
    showActivatorLog: 'Show Activator Log',
    hunterUuid: 'Hunter UUID',
    activatorUuid: 'Activator UUID',
    enterUuid: 'Enter UUID',

    language: 'Language',
    japanese: '日本語',
    english: 'English',

    resetToDefaults: 'Reset to Defaults',
    close: 'Close',

    // Popup
    loading: 'Loading...',
    elevation: 'Elevation',
    activations: 'Activations',
    lastActivation: 'Last Activation',
    position: 'Position',

    // Spots
    noSpots: 'No spots available',
    spotCount: '',
  },
} as const;

export type TranslationKey = keyof typeof translations.ja;
