import { useEffect, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { timeLabel, zoneLabel, type LineInfo, type LogView, type QsoView } from '@/lib/fle'
import { errorText } from '@/lib/errors'
import { keepFocus } from '@/lib/keepFocus'
import { useI18n, type Translate } from '@/lib/i18n'
import { usePlaceNames } from '@/hooks/usePlaceNames'
import type { PlaceKind } from '@/lib/reference'

interface Props {
  view: LogView | null
  /** 確定したあとの、この行の姿(時刻・バンド・モード・RSTが入ったもの)。なければ現在の解釈を使う */
  preview: QsoView | null
  /** カーソルのある行までを読んだ時点の状態(コアが解決した日付・バンド・モード・場所など) */
  info: LineInfo | null
  /** カーソルのある行(0始まり) */
  caretLine: number
  /** カーソルのある行の文字 */
  lineText: string
  /** 設定の時間帯(ログに timezone がないときの時計) */
  timezone: number
  onOpenList: () => void
  /** この行を確定して、次の行へ進む */
  onConfirm: () => void
}

const TONE = {
  ok: 'border-emerald-700 bg-emerald-50 text-emerald-950 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-100',
  error:
    'border-red-700 bg-red-50 text-red-950 dark:border-red-400 dark:bg-red-950 dark:text-red-100',
  draft:
    'border-amber-700 bg-amber-50 text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100',
  plain: 'border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-900',
} as const

/** 設定の漏れ(入力の途中ではなく、書き忘れ)。確定の前でも、すぐ赤で知らせる */
const OMISSIONS = new Set(['missing_band', 'missing_mode'])

const BAR = 'flex-1 min-w-0 rounded-xl border-2 overflow-hidden'
const BIG = 'font-mono text-xl font-bold leading-tight'

/** 場所の指令と、名前を引く種類 */
const PLACE: Record<string, PlaceKind> = { mysota: 'sota', mypota: 'pota', mywwff: 'wwff' }

function placeCodes(info: LineInfo | null): string[] {
  switch (info?.directive) {
    case 'mysota':
      return info.sota ? [info.sota] : []
    case 'mypota':
      return info.pota
    case 'mywwff':
      return info.wwff ? [info.wwff] : []
    default:
      return []
  }
}

/** `2026-10-19 (月)` */
function dateLabel(info: LineInfo, t: Translate): string {
  const wd = t('bar.weekdays').split(',')[info.weekday - 1]
  return wd ? `${info.date} (${wd})` : info.date
}

/**
 * 指令の行で、行からは見えない値(解決した値)。補うものがなければ null(空の行と同じ表示にする)
 */
function resolved(info: LineInfo | null, names: Record<string, string>, t: Translate): ReactNode[] | null {
  if (info?.kind !== 'directive') return null
  switch (info.directive) {
    case 'date':
    case 'day':
      return info.date ? [dateLabel(info, t)] : null
    case 'timezone': {
      const zone = info.timezone === 0 || info.timezone === null ? 'UTC' : zoneLabel(info.timezone)
      return [info.date ? `${dateLabel(info, t)} ${zone}` : zone]
    }
    case 'mysota':
    case 'mypota':
    case 'mywwff': {
      const codes = placeCodes(info)
      return codes.length > 0 ? codes.map((c) => (names[c] ? `${c} ${names[c]}` : c)) : null
    }
    case 'qslmsg':
      return info.qslmsg ? [info.qslmsg] : null
    case 'qslmsg2':
      return info.qslmsg2 ? [info.qslmsg2] : null
    case 'rig':
      return info.rig ? null : [t('bar.noRig')]
    default:
      return null
  }
}

/**
 * カーソルのある行を、補完した結果で見せる(IMEの候補のような表示)。
 * 解釈できた行(緑)は、そのまま押して確定できる。QSO の行以外では、その行の意味(解決した値)か、
 * いまの時刻とバンド・モードを見せる。
 */
export function CandidateBar({
  view,
  preview,
  info,
  caretLine,
  lineText,
  timezone,
  onOpenList,
  onConfirm,
}: Props) {
  const { t, lang } = useI18n()
  const qso = preview ?? view?.qsos.find((q) => q.line === caretLine) ?? null
  const error = view?.errors.find((e) => e.line === caretLine)
  // 入力中の行の誤りの文面は、手が止まって少し経ってから添える(打つたびに変わる文面は、うるさい)
  const [settledFor, setSettledFor] = useState<unknown>(null)
  useEffect(() => {
    const id = window.setTimeout(() => setSettledFor([view, caretLine]), 1500)
    return () => window.clearTimeout(id)
  }, [view, caretLine])
  const settled = Array.isArray(settledFor) && settledFor[0] === view && settledFor[1] === caretLine
  // 入力中の行の誤りは、まだ途中なので数えない(カーソルを離れた行の誤りだけ、赤で知らせる)
  const omissions = view?.errors.filter((e) => e.line === caretLine && OMISSIONS.has(e.code)) ?? []
  const errorCount = (view?.errors.filter((e) => e.line !== caretLine).length ?? 0) + omissions.length

  // 時計(10秒ごとに進める)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(id)
  }, [])

  const names = usePlaceNames(PLACE[info?.directive ?? ''] ?? 'sota', placeCodes(info))

  // 入力の途中(まだ確定できない行)は、打った文字を、橙で見せる。確定できれば緑になる。
  // 途中かどうかは、その行に誤りがあるかで見る(書き終えた指令やコメントの行は、誤りがなく、QSO でもない)
  const typed = lineText.trim()
  const draft = !qso && !!error && typed !== '' && omissions.length === 0
  const tz = info?.timezone ?? timezone
  const clock = new Date(now + tz * 3_600_000).toISOString().slice(11, 16)
  const setting = [info?.band, info?.mode].filter(Boolean).join(' ')
  const meaning = resolved(info, names, t)

  // カーソルの日(UTC)のQSOの数を大きく、全体の数を小さく
  const total = view?.qsos.length ?? 0
  const today = info?.qsoDate ? (view?.qsos.filter((q) => q.date === info.qsoDate).length ?? 0) : total

  return (
    <div className="flex-none flex gap-2 h-[72px]">
      <button
        type="button"
        onClick={onOpenList}
        aria-label={`${t('bar.openList')} (${t('bar.todayLabel', { today, total })})`}
        className={`flex-none min-w-16 px-2 rounded-xl border-2 bg-white dark:bg-gray-950 flex flex-col items-center justify-center leading-tight tabular-nums ${
          errorCount > 0
            ? 'border-red-700 text-red-700 dark:border-red-400 dark:text-red-300'
            : 'border-gray-500'
        }`}
      >
        <b className="text-xl">{today}</b>
        <small className="text-xs font-bold">
          {today === total ? 'QSO' : `/${total}`}
          {errorCount > 0 && ` ⚠${errorCount}`}
        </small>
      </button>

      {qso && !error ? (
        <button
          type="button"
          onClick={onConfirm}
          // 押してもテキスト入力からフォーカスを奪わない(キーボードを閉じない)
          {...keepFocus}
          aria-label={t('bar.confirmLabel')}
          className={`${BAR} ${TONE.ok} flex items-stretch text-left`}
        >
          <span className="flex-1 min-w-0 px-3 py-2 flex flex-col justify-center gap-0.5">
            <span className="flex items-baseline justify-between gap-2">
              <span className={`${BIG} break-all`}>{qso.call}</span>
              <span className="font-bold whitespace-nowrap">
                {qso.band} {qso.mode}
              </span>
            </span>
            <span className="flex flex-wrap gap-x-3 text-sm font-semibold font-mono tabular-nums">
              <span>{timeLabel(qso)}</span>
              <span>
                {qso.rstSent}/{qso.rstRcvd}
              </span>
              {qso.refs.map((r) => (
                <span key={r}>{r}</span>
              ))}
              {qso.comment && <span className="font-sans">{qso.comment}</span>}
            </span>
          </span>
          <span className="flex-none w-16 flex flex-col items-center justify-center gap-0.5 border-l-2 border-emerald-700/40 dark:border-emerald-400/40 font-bold text-sm">
            <Check className="w-6 h-6" aria-hidden="true" />
            {t('bar.confirm')}
          </span>
        </button>
      ) : omissions.length > 0 || draft ? (
        // 書き忘れ(赤)と入力の途中(橙)は同じ形: 打った文字と、足りないもの。書き忘れは、すぐ知らせる
        <div
          aria-live="polite"
          className={`${BAR} px-3 py-2 flex flex-col justify-center gap-0.5 ${omissions.length > 0 ? TONE.error : TONE.draft}`}
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className={`${BIG} break-all line-clamp-1`}>{typed}</span>
            {setting && <span className="font-bold whitespace-nowrap">{setting}</span>}
          </span>
          {omissions.length > 0 ? (
            <p className="text-sm font-bold line-clamp-1">⚠ {omissions.map((e) => errorText(e, lang)).join(' / ')}</p>
          ) : (
            error &&
            settled && <p className="text-sm line-clamp-1">{errorText(error, lang)}</p>
          )}
        </div>
      ) : (
        <div aria-live="polite" className={`${BAR} ${TONE.plain} px-3 py-2 flex flex-col justify-center gap-0.5`}>
          {meaning ? (
            meaning.map((m, i) => (
              <span key={i} className={`${meaning.length > 1 ? 'font-bold' : BIG} line-clamp-1 break-all`}>
                {m}
              </span>
            ))
          ) : (
            <span className="flex items-baseline justify-between gap-2">
              <span className={`${BIG} tabular-nums`}>
                {clock}
                <small className="ml-1 text-sm">{tz === 0 ? 'UTC' : zoneLabel(tz)}</small>
              </span>
              {setting && <span className={BIG}>{setting}</span>}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
