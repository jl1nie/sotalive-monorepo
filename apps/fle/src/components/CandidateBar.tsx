import { useEffect, useState, type ReactNode } from 'react'
import { Check, CornerDownLeft } from 'lucide-react'
import { clockZone, timeLabel, zoneLabel, type LineInfo, type LogView, type QsoView } from '@/lib/fle'
import { errorText } from '@/lib/errors'
import { keepFocus } from '@/lib/keepFocus'
import { useI18n, type Translate } from '@/lib/i18n'
import { usePlaceNames } from '@/hooks/usePlaceNames'
import type { QsoCount } from '@/hooks/useSettings'
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
  /** QSO の数の出し方(既定は、その日の数と全体の数) */
  count?: QsoCount
  /** 時刻を自動で入れるか。入れないときは、時計ではなく、次の QSO が引き継ぐログの時刻を出す */
  autoTime?: boolean
  /**
   * コンパクトな配置。QSO の数は小さな表示だけ(押せない。一覧はメニューから)にし、POTA・SOTA ではアクティベーション成立に必要な数を出す。
   * 従来の配置では、QSO の数は押すと一覧が開くボタン
   */
  compact?: boolean
  /**
   * コンパクトな配置: QSO でない行で、右端に「次の行」を出すか。フルキーでは出さない(キーボードの右下にある)。
   * 確定(✓)は、どの配置でも緑のバーの右端(確定の前に見るログのすぐ横)
   */
  newlineButton?: boolean
  /** コンパクトな配置: 補完候補(右端の ✓・次の行のボタンは覆わない) */
  suggest?: ReactNode
  /** コンパクトな配置: QSO でない行(40m cw など)で、行末で改行して次の行へ(右端のボタン) */
  onNewline?: () => void
  onOpenList?: () => void
  /** この行を確定して、次の行へ進む */
  onConfirm: () => void
  /** 緑のバーで押した要素(コール・RST・時刻)の末尾に、ログ欄のキャレットを置く。RST の受信・送信は、呼ぶ側が決める */
  onSelectPart?: (part: BarPart) => void
}

/** 緑のバーで押せる要素。RST は1つの的(受信か送信かは、押した状況で決まる) */
export type BarPart = 'call' | 'time' | 'rst'

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
/** 緑のバーの、押すと選べる要素 */
const PART = 'text-left rounded-lg active:bg-emerald-200 dark:active:bg-emerald-800'

/** アクティベーション成立に必要な、その日の QSO の数(POTA は 10、SOTA は 4)。どちらでもなければ null */
function qsoTarget(info: LineInfo | null): number | null {
  if (info?.pota.length) return 10
  if (info?.sota) return 4
  return null
}

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
    case 'mycall':
      return info.mycall ? [info.mycall] : null
    case 'mygrid':
      return info.mygrid ? [info.mygrid] : null
    case 'qslmsg':
      return info.qslmsg ? [info.qslmsg] : null
    case 'qslmsg2':
      return info.qslmsg2 ? [info.qslmsg2] : null
    case 'rig':
      return [info.rig || t('bar.noRig')]
    default:
      return null
  }
}

/**
 * カーソルのある行を、補完した結果で見せる(IMEの候補のような表示)。
 * 解釈できた行(緑)は、右端の ✓ で確定できる。コール・RST・時刻を押すと、ログ欄のその末尾へキャレットを置く。QSO の行以外では、その行の意味(解決した値)か、
 * いまの時刻とバンド・モードを見せる。
 */
export function CandidateBar({
  view,
  preview,
  info,
  caretLine,
  lineText,
  timezone,
  count = 'day',
  autoTime = true,
  compact = false,
  newlineButton = true,
  suggest = null,
  onNewline = () => {},
  onOpenList = () => {},
  onConfirm,
  onSelectPart = () => {},
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

  // 時計(1秒ごとに見る。ログ欄の上の時計と、分の変わり目をそろえる)。時刻を自動で入れないときは、ログの時刻を出す
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const names = usePlaceNames(PLACE[info?.directive ?? ''] ?? 'sota', placeCodes(info))

  // 入力の途中(まだ確定できない行)は、打った文字を、橙で見せる。確定できれば緑になる。
  // 途中かどうかは、その行に誤りがあるかで見る(書き終えた指令やコメントの行は、誤りがなく、QSO でもない)
  const typed = lineText.trim()
  const draft = !qso && !!error && typed !== '' && omissions.length === 0
  // 実際にログに入る時刻と同じ時間帯で出す
  const tz = clockZone(info, view, caretLine, timezone)
  const clock = autoTime || !info ? new Date(now + tz * 3_600_000).toISOString().slice(11, 16) : info.time
  const setting = [info?.band, info?.mode].filter(Boolean).join(' ')
  const meaning = resolved(info, names, t)

  // その日(カーソルの日、UTC)のQSOの数を大きく、全体の数(コンパクトで POTA・SOTA なら、アクティベーション成立に必要な数)を小さく。設定で、全体の数だけにもできる
  const total = view?.qsos.length ?? 0
  const today = info?.qsoDate ? (view?.qsos.filter((q) => q.date === info.qsoDate).length ?? 0) : total
  const byDay = count === 'day'

  const shown = byDay ? today : total
  const target = byDay ? qsoTarget(info) : null
  const reached = target !== null && today >= target
  const countLabel = [
    byDay ? t('bar.todayLabel', { today, total }) : t('bar.totalLabel', { total }),
    target === null ? '' : reached ? t('bar.reached', { target }) : t('bar.remaining', { target, n: target - today }),
  ]
    .filter(Boolean)
    .join(' / ')

  // 確定できる行(緑)。コンパクトな配置では、右端は、いつも押せるボタン(✓ か、次の行)
  const confirmable = !!qso && !error
  const bar = qso && !error ? (
    // コール・RST・時刻は、押すとログ欄のその末尾へキャレットを置く(直す機会の多い順に、的を大きく)。確定は右端の ✓
    <div className={`${BAR} ${TONE.ok} flex items-stretch`} {...keepFocus}>
      {compact ? (
        // コンパクト・フルキー: 低く。コールと RST(同じくらい直す、同じ重さの情報)を同じ大きな文字で1段目に、
        // 時刻・バンド・モード・リファレンスは小さく2段目に
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="flex-1 flex items-center gap-x-1 min-h-0 font-mono tabular-nums">
            <button
              type="button"
              {...keepFocus}
              onClick={() => onSelectPart('call')}
              aria-label={t('bar.selectCall')}
              className={`${PART} ${BIG} min-w-0 h-full pl-2 pr-1 break-all line-clamp-1`}
            >
              {qso.call}
            </button>
            <button
              type="button"
              {...keepFocus}
              onClick={() => onSelectPart('rst')}
              aria-label={t('bar.selectRst')}
              className={`${PART} ${BIG} flex-none h-full px-1`}
            >
              {qso.rstSent}/{qso.rstRcvd}
            </button>
          </span>
          <span className="flex-none flex items-center gap-x-2 h-6 text-sm font-semibold tabular-nums">
            <button
              type="button"
              {...keepFocus}
              onClick={() => onSelectPart('time')}
              aria-label={t('bar.selectTime')}
              className={`${PART} h-full pl-2 pr-1 font-mono`}
            >
              {timeLabel(qso)}
            </button>
            <span className="whitespace-nowrap font-bold">
              {qso.band} {qso.mode}
            </span>
            <span className="flex-1 min-w-0 flex gap-x-2 line-clamp-1 overflow-hidden font-mono">
              {qso.refs.map((r) => (
                <span key={r}>{r}</span>
              ))}
              {qso.grid && <span>{qso.grid}</span>}
              {qso.comment && <span className="font-sans">{qso.comment}</span>}
            </span>
          </span>
        </span>
      ) : (
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="flex-1 flex items-center justify-between gap-2 min-h-0">
            <button
              type="button"
              {...keepFocus}
              onClick={() => onSelectPart('call')}
              aria-label={t('bar.selectCall')}
              className={`${PART} ${BIG} flex-1 min-w-0 h-full pl-3 break-all line-clamp-1`}
            >
              {qso.call}
            </button>
            <span className="font-bold whitespace-nowrap pr-2">
              {qso.band} {qso.mode}
            </span>
          </span>
          <span className="flex-1 flex items-center gap-x-1 min-h-0 font-semibold font-mono tabular-nums">
            <button
              type="button"
              {...keepFocus}
              onClick={() => onSelectPart('rst')}
              aria-label={t('bar.selectRst')}
              className={`${PART} h-full pl-3 pr-2 text-base`}
            >
              {qso.rstSent}/{qso.rstRcvd}
            </button>
            <button
              type="button"
              {...keepFocus}
              onClick={() => onSelectPart('time')}
              aria-label={t('bar.selectTime')}
              className={`${PART} h-full px-2 text-sm`}
            >
              {timeLabel(qso)}
            </button>
            <span className="flex-1 min-w-0 flex gap-x-3 text-sm line-clamp-1 overflow-hidden">
              {qso.refs.map((r) => (
                <span key={r}>{r}</span>
              ))}
              {qso.grid && <span>{qso.grid}</span>}
              {qso.comment && <span className="font-sans">{qso.comment}</span>}
            </span>
          </span>
        </span>
      )}
      {/* 右端の ✓(どの配置でも) */}
      <button
        type="button"
        onClick={onConfirm}
        // 押してもテキスト入力からフォーカスを奪わない(キーボードを閉じない)
        {...keepFocus}
        aria-label={t('bar.confirmLabel')}
        className="flex-none w-16 flex flex-col items-center justify-center gap-0.5 border-l-2 border-emerald-700/40 dark:border-emerald-400/40 font-bold text-sm active:bg-emerald-200 dark:active:bg-emerald-800"
      >
        <Check className="w-6 h-6" aria-hidden="true" />
        {t('bar.confirm')}
      </button>
    </div>
  ) : omissions.length > 0 || draft ? (
    // 書き忘れ(赤)と入力の途中(橙)は同じ形: 打った文字と、足りないもの。書き忘れは、すぐ知らせる
    <div
      aria-live="polite"
      className={`${BAR} px-3 ${compact ? 'py-0.5' : 'py-2'} flex flex-col justify-center gap-0.5 ${omissions.length > 0 ? TONE.error : TONE.draft}`}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={`${BIG} break-all line-clamp-1`}>{typed}</span>
        {setting && <span className="font-bold whitespace-nowrap">{setting}</span>}
      </span>
      {omissions.length > 0 ? (
        <p className="text-sm font-bold line-clamp-1">
          ⚠ {omissions.map((e) => errorText(e, lang)).join(' / ')}
        </p>
      ) : (
        error &&
        settled && <p className="text-sm line-clamp-1">{errorText(error, lang)}</p>
      )}
    </div>
  ) : (
    <div
      aria-live="polite"
      className={`${BAR} ${TONE.plain} px-3 ${compact ? 'py-0.5' : 'py-2'} flex flex-col justify-center gap-0.5`}
    >
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
  )

  return (
    // コンパクト・フルキーでは、低く(打っている行とキーボードを近づける)
    <div className={`flex-none flex ${compact ? 'h-[56px] gap-1.5' : 'h-[72px] gap-2'}`}>
      {/* その日(または全体)の QSO の数。コンパクトでは表示だけ(一覧はメニューから)。アクティベーションが成立したら緑、誤りがあれば赤 */}
      {compact ? (
        <span
          // ただの span の aria-label は読まれないことがあるので、1つの絵として名前を持たせる
          role="img"
          aria-label={countLabel}
          title={countLabel}
          className={`flex-none min-w-10 px-1 rounded-lg border-2 flex flex-col items-center justify-center leading-none tabular-nums font-bold ${
            errorCount > 0
              ? 'border-red-700 text-red-700 dark:border-red-400 dark:text-red-300'
              : reached
                ? 'border-emerald-700 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-200'
                : 'border-gray-300 text-gray-800 dark:border-gray-700 dark:text-gray-200'
          }`}
        >
          <span className="text-base">{shown}</span>
          <small className="mt-0.5 text-[11px]">{byDay ? `/${target ?? total}` : 'QSO'}</small>
          {errorCount > 0 && <small className="mt-0.5 text-[11px]">⚠{errorCount}</small>}
        </span>
      ) : (
        <button
          type="button"
          onClick={onOpenList}
          aria-label={byDay ? `${t('bar.openList')} (${t('bar.todayLabel', { today, total })})` : t('bar.openList')}
          className={`flex-none min-w-16 px-2 rounded-xl border-2 bg-white dark:bg-gray-950 flex flex-col items-center justify-center leading-tight tabular-nums ${
            errorCount > 0
              ? 'border-red-700 text-red-700 dark:border-red-400 dark:text-red-300'
              : 'border-gray-500'
          }`}
        >
          <b className="text-xl">{byDay ? today : total}</b>
          <small className="text-xs font-bold">
            {byDay ? `/${total}` : 'QSO'}
            {errorCount > 0 && ` ⚠${errorCount}`}
          </small>
        </button>
      )}

      {compact ? (
        <>
          {/* 補完候補は、真ん中のバーに重ねる(右端のボタンは覆わない) */}
          <div className="relative flex-1 min-w-0 flex">
            {bar}
            <div
              className={`absolute inset-y-0 left-0 z-10 pointer-events-none ${confirmable ? 'right-[4.25rem]' : 'right-0'}`}
            >
              {suggest}
            </div>
          </div>
          {!confirmable && newlineButton && (
            <button
              type="button"
              onClick={onNewline}
              {...keepFocus}
              aria-label={t('bar.newlineLabel')}
              className="flex-none w-16 rounded-xl border-2 border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center gap-0.5 font-bold text-sm active:bg-gray-300 dark:active:bg-gray-700"
            >
              <CornerDownLeft className="w-6 h-6" aria-hidden="true" />
              {t('bar.newline')}
            </button>
          )}
        </>
      ) : (
        bar
      )}
    </div>
  )
}
