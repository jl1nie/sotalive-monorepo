import { useCallback, useEffect, useRef, useState } from 'react'
import type { LangPref, Translate } from '@/lib/i18n'
import { parseRigs } from '@/lib/rig'

export type Theme = 'light' | 'dark' | 'system'
/** 入力欄の文字。等幅(同梱の Roboto Mono)か、ゴシック(本文と同じ)か */
export type EditorFont = 'gothic' | 'mono'
/** QSO の数の出し方。その日(カーソルの日、UTC)の数と全体の数か、全体の数だけか */
export type QsoCount = 'day' | 'total'
/**
 * 入力画面の配置(比べて選べるように、どれも残す)。classic は従来のもの。compact は、打っている行・候補バー・
 * 数字キー・⌫ を手元にまとめたもの(数字キーは2段、ログは下寄せ、補完候補は候補バーに重ねる)。
 * fullkey は、compact に加えて、OS のキーボードの代わりに画面のキーボード(数字・英字・記号・確定)を出すもの
 */
export type Layout = 'classic' | 'compact' | 'fullkey'

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
   * コンパクト・フルキーの配置での writeRst。既定は書かない(打ったまま。意味はバーに出る)。
   * 従来の配置(リリース版)の動きを変えないよう、別に持つ。同期しない(端末ごと)
   */
  writeRstCompact: boolean
  /** 誤りの文面の言語(auto は端末の言語) */
  language: LangPref
  /** キーボードの上に、数字の行(0〜9 と / と -)を出す(ソフトキーボードで、文字と数字の切り替えを減らす) */
  digitRow: boolean
  /** 入力欄の文字(どちらも太め。屋外で読めるように) */
  editorFont: EditorFont
  /** 候補バーの左の、QSO の数の出し方 */
  qsoCount: QsoCount
  /** 入力画面の配置。同期しない(端末ごと) */
  layout: Layout
  /**
   * フルキーのキーの高さ(幅に対する倍率)。1 は正方形、最大 1.5。キーボードの上の縁をドラッグして変える。
   * 同期しない(端末ごと)
   */
  keyScale: number
  /**
   * コンパクト・フルキーの、ログ欄の高さ(行数)。0 は、入る限り高く。ログ欄の上の縁のつまみをドラッグして変える。
   * 空いた上の部分に、時刻と運用先を出す。同期しない(端末ごと)
   */
  logLines: number
  /** よく使うリグ。`rig` の値(HAMLOG の `Rig=` の右辺)の候補になる */
  rigs: string[]
}

export const TIMEZONE_MIN = -12
export const TIMEZONE_MAX = 14
/** フルキーのキーの高さの倍率の範囲(1 は正方形) */
export const KEY_SCALE_MIN = 1
export const KEY_SCALE_MAX = 1.5

const KEY = 'fle.settings'
/**
 * タッチ端末(ソフトキーボード)か。数字の行は初期でオン。フルキーは、タッチ端末でだけ選べる
 * (PC は物理キーボードがあるので、画面のキーボードは要らない)
 */
export const touchDevice = () => {
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
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
  editorFont: 'mono',
  qsoCount: 'day',
  layout: 'classic',
  keyScale: 1,
  logLines: 0,
  rigs: [],
}

/** この端末で、前に FLEonline を使ったことがあるか(ログ・前回のコールサインなど、fle. で始まる保存がある) */
function usedBefore(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i)?.startsWith('fle.')) return true
  }
  return false
}

function load(): Settings {
  try {
    const stored = localStorage.getItem(KEY)
    const v = JSON.parse(stored ?? '{}')
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
      digitRow: typeof v.digitRow === 'boolean' ? v.digitRow : touchDevice(),
      editorFont: v.editorFont === 'gothic' ? 'gothic' : 'mono',
      qsoCount: v.qsoCount === 'total' ? 'total' : 'day',
      // 配置: 初めて使うスマホはフルキー。前から使っている端末は、選んでいなければ従来のまま
      layout:
        v.layout === 'compact' || v.layout === 'fullkey' || v.layout === 'classic'
          ? v.layout
          : stored === null && touchDevice() && !usedBefore()
            ? 'fullkey'
            : 'classic',
      keyScale:
        typeof v.keyScale === 'number' && v.keyScale >= KEY_SCALE_MIN && v.keyScale <= KEY_SCALE_MAX ? v.keyScale : 1,
      // 2行から(以前の版の 1 行は、入る限り高くとして読む)
      logLines: Number.isInteger(v.logLines) && v.logLines >= 2 && v.logLines <= 100 ? v.logLines : 0,
      rigs: Array.isArray(v.rigs) ? parseRigs(v.rigs.filter((r: unknown) => typeof r === 'string').join('\n')) : [],
    }
    // 初めて読んだときに決めた配置を覚えておく(あとでログができても、配置が変わらないように)
    if (stored === null) localStorage.setItem(KEY, JSON.stringify(settings))
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
