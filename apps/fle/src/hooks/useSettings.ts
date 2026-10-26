import { useCallback, useEffect, useRef, useState } from 'react'
import type { LangPref, Translate } from '@/lib/i18n'
import { parseRigs } from '@/lib/rig'
import { DEFAULT_HAMLOG_COLUMNS, type HamlogColumns, type HamlogZone } from '@/lib/hamlog'

export type Theme = 'light' | 'dark' | 'system'
/** ログ欄と情報窓の文字の大きさ。中が今の大きさ */
export type FontSize = 'small' | 'medium' | 'large'
/** 文字の大きさの倍率(CSS の `--fle-scale`) */
export const FONT_SCALE: Record<FontSize, number> = { small: 0.85, medium: 1, large: 1.2 }
/** QSO の数の出し方。その日(カーソルの日、UTC)の数と全体の数か、全体の数だけか */
export type QsoCount = 'day' | 'total'
/**
 * 入力画面の配置。classic は従来のもの(PC)。fullkey は、打っている行・候補バーを手元にまとめ(ログは下寄せ、
 * 補完候補は候補バーに重ねる)、OS のキーボードの代わりに画面のキーボード(数字・英字・記号・改行)を出すもの(スマホ)。
 * タッチ端末はフルキー、PC は従来で、選べない(端末で決まる)
 */
export type Layout = 'classic' | 'fullkey'

export interface Settings {
  theme: Theme
  /** 既定のタイムゾーン(UTCからの時間差。UTC は 0) */
  timezone: number
  /** 時刻のない QSO の行を確定するとき、いまの時刻を入れる(紙ログの打ち込みではオフ)。同期しない(端末ごと) */
  autoTime: boolean
  /** 確定ボタンで、バンド・モードも書く */
  writeBandMode: boolean
  /** 確定ボタンで、RSTも書く(省略した 599/59 や、4 のような省略形も) */
  writeRst: boolean
  /**
   * フルキーの配置での writeRst(以前のコンパクトから引き継ぐので、名前はそのまま)。既定は書かない(打ったまま。意味はバーに出る)。
   * 従来の配置(リリース版)の動きを変えないよう、別に持つ。同期しない(端末ごと)
   */
  writeRstCompact: boolean
  /** 誤りの文面の言語(auto は端末の言語) */
  language: LangPref
  /** キーボードの上に、数字の行(0〜9 と / と -)を出す(ソフトキーボードで、文字と数字の切り替えを減らす) */
  digitRow: boolean
  /** ログ欄と情報窓の文字の大きさ(文字は太めの等幅で固定。屋外で読めるように)。同期しない(端末ごと) */
  fontSize: FontSize
  /** 候補バーの左の、QSO の数の出し方 */
  qsoCount: QsoCount
  /**
   * フルキーのキーの高さ(幅に対する倍率)。1 は正方形、最大 1.5。キーボードの上の縁をドラッグして変える。
   * 同期しない(端末ごと)
   */
  keyScale: number
  /**
   * フルキーで、ログ欄の上に時刻と運用先(とメモ)を出す。入らないとき(OS のキーボードで狭いときなど)は出さない。
   * 同期しない(端末ごと)
   */
  showClock: boolean
  /**
   * フルキーの英字を大文字で打つ(Caps。Z の左のキー)。FLE は大文字・小文字を区別しないので、どちらでも同じに読む。
   * 夕方など、小文字の m と n を見分けにくいとき。同期しない(端末ごと)
   */
  capsLock: boolean
  /** よく使うリグ。`rig` の値(HAMLOG の `Rig=` の右辺)の候補になる */
  rigs: string[]
  /** HAMLOG の QTH・Rmks1・Rmks2 の欄に書く内容(`{memo}` などを差し込む書式) */
  hamlog: HamlogColumns
  /** HAMLOG の CSV の時刻を、JST(J)と UTC(U)のどちらで書くか。ログの `timezone` によらない */
  hamlogZone: HamlogZone
}

/** HAMLOG の欄の書式の長さの上限(同期のサーバーと同じ) */
export const HAMLOG_COLUMN_MAX = 100

/** 保存した HAMLOG の欄の書式を読む。欄ごとに、文字列でなければ既定 */
export function parseHamlogColumns(v: unknown): HamlogColumns {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
  const col = (k: keyof HamlogColumns) =>
    typeof o[k] === 'string' && (o[k] as string).length <= HAMLOG_COLUMN_MAX ? (o[k] as string) : DEFAULT_HAMLOG_COLUMNS[k]
  return { qth: col('qth'), rmks1: col('rmks1'), rmks2: col('rmks2') }
}

export const TIMEZONE_MIN = -12
export const TIMEZONE_MAX = 14
/** フルキーのキーの高さの倍率の範囲(1 は正方形) */
export const KEY_SCALE_MIN = 1
export const KEY_SCALE_MAX = 1.5

const KEY = 'fle.settings'
/**
 * タッチ端末(ソフトキーボード)か。タッチ端末はフルキー、PC は従来の配置
 * (PC は物理キーボードがあるので、画面のキーボードは要らない)
 */
export const touchDevice = () => {
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}
/** 動く配置。端末で決まる(タッチ端末はフルキー、PC は従来) */
export function activeLayout(touch: boolean): Layout {
  return touch ? 'fullkey' : 'classic'
}

const DEFAULTS: Settings = {
  theme: 'system',
  timezone: 0,
  autoTime: true,
  writeBandMode: false,
  writeRst: true,
  writeRstCompact: false,
  language: 'auto',
  digitRow: false,
  fontSize: 'medium',
  qsoCount: 'day',
  keyScale: 1,
  showClock: true,
  capsLock: false,
  rigs: [],
  hamlog: DEFAULT_HAMLOG_COLUMNS,
  hamlogZone: 'jst',
}

function load(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const theme: Theme = v.theme === 'light' || v.theme === 'dark' ? v.theme : 'system'
    const timezone =
      Number.isInteger(v.timezone) && v.timezone >= TIMEZONE_MIN && v.timezone <= TIMEZONE_MAX
        ? v.timezone
        : 0
    const settings: Settings = {
      theme,
      timezone,
      autoTime: typeof v.autoTime === 'boolean' ? v.autoTime : DEFAULTS.autoTime,
      writeBandMode: typeof v.writeBandMode === 'boolean' ? v.writeBandMode : DEFAULTS.writeBandMode,
      writeRst: typeof v.writeRst === 'boolean' ? v.writeRst : DEFAULTS.writeRst,
      writeRstCompact: typeof v.writeRstCompact === 'boolean' ? v.writeRstCompact : DEFAULTS.writeRstCompact,
      language: v.language === 'ja' || v.language === 'en' ? v.language : 'auto',
      // 数字キーの行は、PC の従来の配置でだけ使う(タッチ端末はフルキー)
      digitRow: typeof v.digitRow === 'boolean' ? v.digitRow : DEFAULTS.digitRow,
      fontSize: v.fontSize === 'small' || v.fontSize === 'large' ? v.fontSize : 'medium',
      qsoCount: v.qsoCount === 'total' ? 'total' : 'day',
      keyScale:
        typeof v.keyScale === 'number' && v.keyScale >= KEY_SCALE_MIN && v.keyScale <= KEY_SCALE_MAX ? v.keyScale : 1,
      showClock: typeof v.showClock === 'boolean' ? v.showClock : DEFAULTS.showClock,
      capsLock: typeof v.capsLock === 'boolean' ? v.capsLock : DEFAULTS.capsLock,
      rigs: Array.isArray(v.rigs) ? parseRigs(v.rigs.filter((r: unknown) => typeof r === 'string').join('\n')) : [],
      hamlog: parseHamlogColumns(v.hamlog),
      hamlogZone: v.hamlogZone === 'utc' ? 'utc' : 'jst',
    }
    return settings
  } catch {
    return DEFAULTS
  }
}

/** 設定の読み書きと、テーマの反映。初期値は、端末のテーマに合わせ、時刻はUTC。 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load)
  const current = useRef(settings)

  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...current.current, ...patch }
    current.current = next
    setSettings(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // 保存できなくても動作には影響しない
    }
  }, [])

  const { theme } = settings
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () =>
      root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches))
    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  return { settings, update }
}

/** 設定画面の表示用。0 は「UTC」、9 は日本標準時を添える。 */
export function timezoneLabel(tz: number, t: Translate): string {
  if (tz === 0) return t('tz.utc')
  const base = `UTC${tz > 0 ? '+' : '-'}${Math.abs(tz)}`
  return tz === 9 ? `${base}${t('tz.jst')}` : base
}
