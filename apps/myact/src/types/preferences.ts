// User Preferences Types

export type Theme = 'light' | 'dark' | 'system';
export type Language = 'ja' | 'en';

export interface Preferences {
  // 言語
  language: Language;
  // テーマ
  theme: Theme;
  // 表示対象
  sota_ref: boolean;
  pota_ref: boolean;
  jaff_ref: boolean;
  display_area: boolean;
  aprs_track: boolean;
  pilgrim: boolean;

  // マーカー設定
  popup_permanent: boolean;
  link_googlemap: boolean;
  display_mapcode: boolean;
  zoom_threshold: number;

  // スポット設定
  spot_period: number;
  by_call: boolean;

  // POTAログ
  show_potalog: boolean;
  show_potaactlog: boolean;
  pota_hunter_uuid: string | null;
  pota_activator_uuid: string | null;

  // パドルエミュレータ
  enable_emulation: boolean;
  enable_wifi: boolean;
  enable_serial: boolean;
  pemu_call: string;
  pemu_areacode: string;
  pemu_century: string;
  pemu_sota: string;
  pemu_pota: string;
  pemu_jaff: string;
  pemu_mesg1: string;
  pemu_mesg2: string;
  pemu_mesg3: string;
  pemu_mesg4: string;
  pemu_wpm: string;
  pemu_host: string;
  include_areacode: boolean;
  paddle_reverse: boolean;
  to_paddle: boolean;
  to_key: boolean;
}

export const defaultPreferences: Preferences = {
  // 言語
  language: 'ja',
  // テーマ
  theme: 'dark',
  // 表示対象
  sota_ref: true,
  pota_ref: true,
  jaff_ref: true,
  display_area: false,
  aprs_track: true,
  pilgrim: false,

  // マーカー設定
  popup_permanent: true,
  link_googlemap: false,
  display_mapcode: false,
  zoom_threshold: 12,

  // スポット設定
  spot_period: 6,
  by_call: false,

  // POTAログ
  show_potalog: false,
  show_potaactlog: true,
  pota_hunter_uuid: null,
  pota_activator_uuid: null,

  // パドルエミュレータ
  enable_emulation: false,
  enable_wifi: false,
  enable_serial: true,
  pemu_call: '',
  pemu_areacode: '',
  pemu_century: '',
  pemu_sota: '',
  pemu_pota: '',
  pemu_jaff: '',
  pemu_mesg1: 'CQ CQ CQ DE $CALL SOTA $SOTA +',
  pemu_mesg2: 'CQ CQ CQ DE $CALL POTA $POTA +',
  pemu_mesg3: 'CQ CQ CQ DE $CALL JAFF $JAFF +',
  pemu_mesg4: 'p 1#CQ CQ CQ DE $CALL SOTA $SOTA+',
  pemu_wpm: '40',
  pemu_host: 'actpaddle.local',
  include_areacode: true,
  paddle_reverse: false,
  to_paddle: true,
  to_key: false,
};
