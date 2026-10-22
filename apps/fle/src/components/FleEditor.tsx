import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BookOpen,
  ClipboardList,
  Download,
  FilePlus,
  FileText,
  HelpCircle,
  Home,
  Keyboard,
  List,
  MapPin,
  Save,
  Smartphone,
  Trash2,
  Undo2,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import {
  compileLog,
  completeAt,
  fillLine,
  generateFleZip,
  logFileStem,
  lineInfo,
  adifToFle,
  checkOutput,
  sampleLog,
  stationAt,
  stationPlan,
  selectPart,
  retimeLog,
  zoneLabel,
  clockZone,
  type QsoPart,
  type Station,
  type Candidate,
  type Completion,
  type FieldError,
  type LineInfo,
  type LogView,
  type OutputWarning,
  type QsoView,
} from '@/lib/fle'
import { LangProvider } from '@/components/LangProvider'
import { resolveLang, useI18n } from '@/lib/i18n'
import { lineOf, lineRange, replaceRange } from '@/lib/lines'
import { applyEdits, mapCaret } from '@/lib/edits'
import { keepFocus } from '@/lib/keepFocus'
import { alignToBottom, scrollCaretIntoView } from '@/lib/caretScroll'
import { loadLastCall, loadLog, loadPrev, rememberPrev, saveLastCall } from '@/lib/storage'
import { useVisualViewport } from '@/hooks/useVisualViewport'
import { useLandscapePhone } from '@/hooks/useLandscapePhone'
import { useClockRoom } from '@/hooks/useClockRoom'
import { useAutosave } from '@/hooks/useAutosave'
import { usePwa } from '@/hooks/usePwa'
import { activeLayout, touchDevice, useSettings, type Settings } from '@/hooks/useSettings'
import { Header } from '@/components/Header'
import { DigitRow } from '@/components/DigitRow'
import { FullKeyboard } from '@/components/FullKeyboard'
import { StationClock } from '@/components/StationClock'
import { rigCompletion } from '@/lib/rig'
import { CandidateBar, type BarPart } from '@/components/CandidateBar'
import { nextRst, type RstMark } from '@/lib/rstToggle'
import { exportName } from '@/lib/fileName'
import { SuggestStrip } from '@/components/SuggestStrip'
import { QsoSheet } from '@/components/QsoSheet'
import { PlaceSheet } from '@/components/PlaceSheet'
import { FieldKeysContext } from '@/hooks/useFieldKeys'
import { PlanSheet } from '@/components/PlanSheet'
import { JoinSheet } from '@/components/JoinSheet'
import { usePlans } from '@/hooks/usePlans'
import { useSync } from '@/hooks/useSync'
import { extraLines, withExtras, type PlanExtras } from '@/lib/planApply'
import { lookupMemo, memoAt } from '@/lib/memo'
import { placePosition } from '@/lib/reference'
import { codeFromText } from '@/lib/sync'
import { GenerateCheckSheet } from '@/components/GenerateCheckSheet'
import { Sheet } from '@/components/Sheet'
import { RetimeSheet } from '@/components/RetimeSheet'
import { planTzChange } from '@/lib/tzChange'

/** 使い方(アプリと同じ場所に置く静的なページ。`public/manual/`) */
const MANUAL_URL = `${import.meta.env.BASE_URL}manual/`
const MANUAL_URL_EN = `${MANUAL_URL}en/`

const MENU_ITEM =
  'btn-secondary w-full !justify-start !min-h-14 text-left'

/** 設定(言語を含む)を持ち、画面全体に表示言語を渡す */
export function FleEditor() {
  const { settings, update } = useSettings()
  const lang = resolveLang(settings.language)
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  return (
    <LangProvider lang={lang}>
      <Editor settings={settings} updateSettings={update} />
    </LangProvider>
  )
}

function Editor({
  settings,
  updateSettings,
}: {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}) {
  const keyboard = useVisualViewport()
  const { t, lang } = useI18n()
  const plansStore = usePlans()
  const sync = useSync({
    settings,
    update: updateSettings,
    records: plansStore.records,
    replacePlans: plansStore.replaceAll,
  })
  const [plansOpen, setPlansOpen] = useState(false)
  // QR(URL)で開いたときの同期コード。確かめてから参加する
  const [joinCode, setJoinCode] = useState<string | null>(() => codeFromText(window.location.hash))

  // 前回の入力を復元する(電池切れ・タブの終了でも失わない)
  const [text, setText] = useState(loadLog)
  const [caret, setCaret] = useState(text.length)
  const [prev, setPrev] = useState(loadPrev)
  const [view, setView] = useState<LogView | null>(null)
  const [completion, setCompletion] = useState<Completion>({ from: 0, candidates: [] })
  // 確定したあとの、カーソル行の姿。どの入力に対するものかを key で持ち、古くなったら使わない
  const [previewed, setPreviewed] = useState<{ key: string; qso: QsoView } | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // 生成の前に知らせる、ログの不足(あるときだけ、確認のシートを開く)
  const [check, setCheck] = useState<OutputWarning[] | null>(null)
  // 場所のシート: どの行の前に書くか(開いた時点のカーソル行)と、初期値。`fresh` なら、新しいログ(空のログに書く)
  const [place, setPlace] = useState<{ line: number; initial: Station; memo: string; isNewLog: boolean; fresh: boolean } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // 時間帯を変えるときの確認(QSO のあるログで、時刻を変換するか)
  const [retime, setRetime] = useState<{ tz: number; from: string; to: string; qsos: number } | null>(null)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const fleInputRef = useRef<HTMLInputElement>(null)
  const adifInputRef = useRef<HTMLInputElement>(null)
  const noticeTimer = useRef<number>(0)
  // いま打っている行を、最初の1文字を打った時刻とともに覚える(その行の時刻にする)
  const lineStartedAt = useRef<{ line: number; ms: number } | null>(null)
  // 候補の確定後に置くカーソル位置。描画(コミット)の直後、次の入力より先に反映する
  const pendingCaret = useRef<number | null>(null)

  // 取り消し(フルキーの ↶)の履歴。編集のひとまとまり(⌫ を続けた分・続けて打った分)ごとに、
  // その前の内容とキャレットを積む。キャレットを動かしたり、打つ・消すが入れ替わったり、打つ行が変わったりしたら、
  // 次のまとまり(打つのは1行ずつ戻る。⌫ を押しすぎて前の行まで消したときは、1回で消す前に戻る)
  const undoHistory = useRef<{ text: string; caret: number }[]>([])
  const lastEdit = useRef<{ kind: 'type' | 'delete' | 'other'; caret: number; line: number } | null>(null)
  const before = useRef({ text, caret })
  const undoing = useRef(false)
  useEffect(() => {
    const prev = before.current
    before.current = { text, caret }
    if (prev.text === text) return
    if (undoing.current) {
      undoing.current = false
      lastEdit.current = null
      return
    }
    const kind = text.length < prev.text.length ? 'delete' : text.length > prev.text.length ? 'type' : 'other'
    const last = lastEdit.current
    // まとまりの行は、始めた行(確定で次の行へ移っても、次に打つ分は別のまとまり)
    const line = lineOf(prev.text, prev.caret)
    const fresh =
      !last ||
      last.kind !== kind ||
      last.caret !== prev.caret ||
      kind === 'other' ||
      (kind === 'type' && last.line !== line)
    if (fresh) {
      undoHistory.current.push(prev)
      if (undoHistory.current.length > 100) undoHistory.current.shift()
    }
    lastEdit.current = { kind, caret, line: fresh || !last ? line : last.line }
  }, [text, caret])

  /** 直前の編集のひとまとまりを取り消す(⌫ を押しすぎたとき) */
  const undo = () => {
    let snap = undoHistory.current.pop()
    while (snap && snap.text === text) snap = undoHistory.current.pop()
    if (!snap) return
    undoing.current = true
    pendingCaret.current = snap.caret
    setText(snap.text)
    setCaret(snap.caret)
  }

  /** 取り消せる操作のあとは、通知に「元に戻す」を添える(戻す先の内容を持つ) */
  const [undoTo, setUndoTo] = useState<string | null>(null)
  const notify = useCallback((message: string, undo?: string) => {
    setNotice(message)
    setUndoTo(undo ?? null)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), undo === undefined ? 4000 : 8000)
  }, [])

  useAutosave(
    text,
    useCallback(() => notify(t('notice.autosaveFailed')), [notify, t])
  )
  const pwa = usePwa(useCallback(() => notify(t('notice.offlineReady')), [notify, t]))

  // 内容を置き換える前に、今の内容を取っておく(メニューから戻せる)。
  // カーソルは末尾に置く(前の内容での位置のままだと、場所のシートなどが別の行を基準にしてしまう)。
  // フォーカスはしない(メニューの操作で、キーボードを出さない)
  const replaceText = useCallback(
    (next: string, message?: string) => {
      if (text.trim()) {
        rememberPrev(text)
        setPrev(text)
        if (message) notify(message, text)
      }
      setText(next)
      setCaret(next.length)
    },
    [text, notify]
  )

  // 復元した内容の末尾にカーソルを置く(フォーカスはしない。キーボードを出さないため)
  useLayoutEffect(() => {
    const ta = taRef.current
    if (ta) ta.setSelectionRange(ta.value.length, ta.value.length)
  }, [])

  // 入力のたびに全体を解釈し直す(WASMなので一瞬)
  useEffect(() => {
    let current = true
    compileLog(text)
      .then((v) => current && setView(v))
      .catch((e) => current && notify(e instanceof Error ? e.message : t('notice.compileFailed')))
    return () => {
      current = false
    }
  }, [text, notify, t])

  // カーソル位置で文法上ありえるキーワードを、コアに尋ねる
  useEffect(() => {
    let current = true
    const before = text.slice(0, caret)
    // `rig ` の値は、個人の設定のリグの一覧から出す(文法でなく、画面の動作)
    const own = rigCompletion(before, settings.rigs)
    if (own) {
      setCompletion(own)
      return
    }
    completeAt(before)
      .then((c) => current && setCompletion(c))
      .catch(() => current && setCompletion({ from: 0, candidates: [] }))
    return () => {
      current = false
    }
  }, [text, caret, settings.rigs])

  // フルキー: OS のキーボードの代わりに、画面のキーボードを出す。🌐 で、OS のキーボード(日本語など)に切り替える
  // PC(タッチでない端末)では、フルキーを選んでいても、従来として動く(物理キーボードがある)
  const [touch] = useState(touchDevice)
  const fullkey = activeLayout(settings.layout, touch) === 'fullkey'
  // フルキーでは、打っている行を、欄の下端(候補バーのすぐ上)に寄せる。内容が変わったときと、欄の大きさが変わったとき。
  // キャレットを置き直すより先に(寄せたあとの位置で、見えるところまで動かす)。OS のキーボードにしている間も同じ
  const compact = fullkey
  // フルキーは縦向きで使う(横向きでは、キーボードとログが入らない)
  const landscape = useLandscapePhone() && compact

  // フルキー: ログ欄の上に、時刻と運用先を出す(設定で出すとき、入る場所があれば)
  const clockRoom = useClockRoom({ enabled: compact && settings.showClock, taRef, deps: [settings.editorFont] })
  const [osKeyboard, setOsKeyboard] = useState(false)
  const onScreenKeys = fullkey && !osKeyboard
  // シートの入力欄(自局・リファレンスなど)の画面のキーボード。🌐 での切り替えは、ログ欄とは別に持つ
  const [fieldOs, setFieldOs] = useState(false)
  const fieldKeys = useMemo(
    () => ({
      enabled: fullkey,
      os: fieldOs,
      setOs: setFieldOs,
      keyScale: settings.keyScale,
      onKeyScale: (keyScale: number) => updateSettings({ keyScale }),
    }),
    [fullkey, fieldOs, settings.keyScale, updateSettings]
  )
  // inputmode は、フォーカスし直さないと効かない(iOS)。入力中に切り替えたときは、いったん外して戻す
  useEffect(() => {
    const ta = taRef.current
    if (!ta || document.activeElement !== ta) return
    ta.blur()
    ta.focus()
  }, [onScreenKeys])
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    if (compact) alignToBottom(ta)
    else ta.style.paddingTop = ''
  }, [text, settings.editorFont, compact])
  useEffect(() => {
    const ta = taRef.current
    if (!compact || !ta || typeof ResizeObserver === 'undefined') return
    // 欄の高さが変わったら(キーボードの高さ・OS のキーボード)、打っている行が見えるところへ
    const observer = new ResizeObserver(() => {
      alignToBottom(ta)
      scrollCaretIntoView(ta, ta.selectionStart, true)
    })
    observer.observe(ta)
    return () => observer.disconnect()
  }, [compact])

  useLayoutEffect(() => {
    const pos = pendingCaret.current
    const ta = taRef.current
    if (pos === null || !ta) return
    pendingCaret.current = null
    ta.focus()
    ta.setSelectionRange(pos, pos)
    scrollCaretIntoView(ta, pos, compact)
  }, [text, compact])

  const caretLine = lineOf(text, caret)
  const hasText = text.trim().length > 0
  /** メニューの項目: メニューを閉じてから行う */
  const fromMenu = (f: () => void) => () => {
    setMenuOpen(false)
    f()
  }

  // OK(確定)で何を書くか(時刻は、自動で入れる設定なら。省略形の時刻も直す)。改行では何も書かない
  const noClock = !settings.autoTime
  // RST を書くかは、配置ごとに持つ(フルキーの既定は書かない。従来はリリース版のまま)
  const writeRst = compact ? settings.writeRstCompact : settings.writeRst
  const confirmScope = {
    noClock,
    expandTime: true,
    bandMode: settings.writeBandMode,
    rst: writeRst,
  }

  // この行を確定したら、どう見えるか(時刻・バンド・モード・RSTが入った姿)を先に見せる
  const previewKey = `${caretLine}|${settings.timezone}|${noClock}|${settings.writeBandMode}|${writeRst}|${text}`
  useEffect(() => {
    const line = caretLine
    if (!view?.qsos.some((q) => q.line === line)) return
    const edits = fillLine(text, line, startedAtFor(line), settings.timezone, confirmScope)
    if (edits.length === 0) return
    let current = true
    const filled = applyEdits(text, edits)
    const shift = filled.split('\n').length - text.split('\n').length // timezone行が先頭に増える分
    compileLog(filled)
      .then((v) => {
        const qso = v.qsos.find((q) => q.line === line + shift)
        if (current && qso) setPreviewed({ key: previewKey, qso })
      })
      .catch(() => {})
    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 時刻は、確定の直前に決める
  }, [previewKey, view])
  const preview = previewed?.key === previewKey ? previewed.qso : null

  // カーソルのある行までを読んだ時点の状態(候補バーが、その行の意味を出す)。
  // 打つたびに一瞬消えないよう、新しい結果が来るまでは前の結果を使う
  const [info, setInfo] = useState<LineInfo | null>(null)
  useEffect(() => {
    let current = true
    lineInfo(text, caretLine)
      .then((value) => current && setInfo(value))
      .catch(() => {})
    return () => {
      current = false
    }
  }, [text, caretLine])

  const focusAt = useCallback((pos: number, select?: [number, number]) => {
    // シートが閉じてフォーカスが戻った後に、入力欄へカーソルを置く
    window.setTimeout(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus()
      // 誤りの範囲があれば、それを選んで見せる
      ta.setSelectionRange(select?.[0] ?? pos, select?.[1] ?? pos)
      scrollCaretIntoView(ta, select?.[0] ?? pos)
      setCaret(select?.[1] ?? pos)
    }, 50)
  }, [])

  const pick = useCallback(
    (candidate: Candidate) => {
      const next = replaceRange(text, completion.from, caret, candidate.text)
      pendingCaret.current = next.caret
      setText(next.text)
      setCaret(next.caret)
    },
    [text, caret, completion.from]
  )

  // 自局のコールサインは、場所のシートなどで自分で入れたものだけを覚える
  // (ログから覚えると、サンプルや人のログを開いたときに、そのコールサインになる)

  /** 新しいログのシートを開く。自局は前回のもの、場所は空 */
  const openNewLog = () => {
    setPlace({
      line: 0,
      initial: { mycall: loadLastCall(), sota: '', pota: [], wwff: '', grid: '' },
      memo: '',
      isNewLog: true,
      fresh: true,
    })
  }

  /** 場所のシートを開く。初期値は、カーソル位置で有効な自局と場所(自局が空なら前回のもの) */
  const openPlace = async (line = caretLine) => {
    const current = await stationAt(text, line)
    setPlace({
      line,
      initial: { ...current, mycall: current.mycall || loadLastCall() },
      memo: memoAt(text, line),
      isNewLog: !view?.qsos.some((q) => q.line < line),
      fresh: false,
    })
  }

  /** 場所をログに書き込む(指令の行の書式はコアが決める)。誤りがあれば返す。新しいログなら、空のログに書いて置き換える */
  const applyPlace = async (want: Station, extras: PlanExtras | undefined, memoValue: string | null): Promise<FieldError[]> => {
    if (!place) return []
    const base = place.fresh ? '' : text
    const plan = await stationPlan(base, place.line, want)
    if (plan.errors.length > 0) return plan.errors
    // メモ(`#` の行)。欄が空で触っていなければ、山・公園から JCC・JCG を引く(引けなければ書かない)。
    // その位置で有効なメモと同じなら、書かない
    const memo = memoValue ?? (await autoMemo(want))
    const lines = [
      ...(extras ? extraLines(extras, base) : []),
      ...(memo && memoAt(base, place.line) !== memo ? [`# ${memo}`] : []),
    ]
    const edits = withExtras(base, place.line, plan.edits, lines)
    if (place.fresh) {
      // 今のログは、メニューの「元に戻す」と通知から戻せる
      // 書き込んだあとは、続けて打てるよう末尾にフォーカスする(場所の変更と同じ)
      const next = applyEdits(base, edits)
      if (next !== text) {
        replaceText(next, t('notice.newLog'))
        pendingCaret.current = next.length
      }
    } else if (edits.length > 0) {
      const at = mapCaret(caret, edits)
      pendingCaret.current = at
      setText(applyEdits(text, edits))
      setCaret(at)
    }
    saveLastCall(want.mycall)
    setPlace(null)
    return []
  }

  /** 山(なければ最初の公園)の JCC・JCG。引けなければ空 */
  const autoMemo = async (want: Station): Promise<string> => {
    const code = want.sota.trim() || want.pota.join(' ').split(/[\s,]+/).find(Boolean)
    if (!code) return ''
    const pos = await placePosition(want.sota.trim() ? 'sota' : 'pota', code)
    return pos ? lookupMemo(pos.lat, pos.lon) : ''
  }

  const jump = useCallback(
    (line: number, range?: [number, number]) => {
      setListOpen(false)
      const ta = taRef.current
      if (!ta) return
      const [, end] = lineRange(text, line)
      focusAt(end, range)
    },
    [text, focusAt]
  )

  // その行を打ち始めた時刻(覚えていなければ、いま)
  function startedAtFor(line: number) {
    return lineStartedAt.current?.line === line ? lineStartedAt.current.ms : Date.now()
  }

  /**
   * 緑の候補バーの OK: カーソルの行を確定して(時刻・バンド・モード・RST を書き足して)、次へ進む。
   * 進み方は、カーソルの位置で変わる。最後の行なら、改行して新しい行へ。次の行があれば、その行末へ移るだけ
   * (改行は足さない。ログの途中で押しても、空の行が割り込まない)。ログの途中に行を足すのは、↵(エディタの改行)
   */
  const confirmLine = () => {
    const line = caretLine
    const edits = fillLine(text, line, startedAtFor(line), settings.timezone, confirmScope)
    const filled = applyEdits(text, edits)
    const shift = filled.split('\n').length - text.split('\n').length // timezone行が先頭に増える分
    const done = line + shift
    lineStartedAt.current = null
    const lines = filled.split('\n')
    if (done < lines.length - 1) {
      const pos = lineRange(filled, done + 1)[1]
      if (filled !== text) {
        pendingCaret.current = pos
        setText(filled)
      } else {
        // 内容が変わらないと、描画の後のキャレットの置き直しが走らないので、ここで置く
        const ta = taRef.current
        if (ta) {
          ta.focus()
          ta.setSelectionRange(pos, pos)
          scrollCaretIntoView(ta, pos, compact)
        }
      }
      setCaret(pos)
      return
    }
    const end = lineRange(filled, done)[1]
    pendingCaret.current = end + 1
    setText(filled.slice(0, end) + '\n' + filled.slice(end))
    setCaret(end + 1)
  }

  /**
   * 入力の変化を受ける。改行(画面のキーボードの ↵・OS のキーボードや PC の Enter)は、エディタと同じく
   * 改行を入れるだけ(時刻などは書かない。書くのは OK)。いま打っている行の、最初の1文字を打った時刻を覚える
   * (OK で確定するときの、その行の時刻にする)
   */
  const handleChange = (value: string, pos: number) => {
    const line = lineOf(value, pos)
    const [start, end] = lineRange(value, line)
    if (value.slice(start, end).trim() === '') lineStartedAt.current = null
    else if (lineStartedAt.current?.line !== line) lineStartedAt.current = { line, ms: Date.now() }
    setText(value)
    setCaret(pos)
  }

  /**
   * 緑の候補バーで押した要素の末尾に、キャレットを置く(⌫ で末尾から直す)。選択はしない(打つと消えてしまう)。
   * 行に書かれていなければ、書き込んでから置く
   */
  const lastRst = useRef<RstMark | null>(null)
  const caretToPart = (barPart: BarPart) => {
    const part: QsoPart = barPart === 'rst' ? nextRst(lastRst.current, text, caret) : barPart
    const sel = selectPart(text, caretLine, part, startedAtFor(caretLine), settings.timezone, noClock)
    if (!sel) return
    const after = sel.edits.length === 0 ? text : applyEdits(text, sel.edits)
    lastRst.current = part === 'rstRcvd' || part === 'rstSent' ? { part, text: after, caret: sel.to } : null
    if (sel.edits.length === 0) {
      const ta = taRef.current
      if (ta) {
        ta.focus()
        ta.setSelectionRange(sel.to, sel.to)
        // 打っている行から離れてスクロールしていても、直す場所を見せる
        scrollCaretIntoView(ta, sel.to, compact)
      }
      setCaret(sel.to)
      return
    }
    pendingCaret.current = sel.to
    setText(after)
    setCaret(sel.to)
  }

  /** 数字の行をなぞったとき: カーソルを `delta` 文字動かす(選択があれば、動かす向きの端から) */
  const moveCaret = (delta: number) => {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const base = start === end ? start : delta < 0 ? start : end
    const pos = Math.max(0, Math.min(text.length, base + delta))
    ta.setSelectionRange(pos, pos)
    scrollCaretIntoView(ta, pos, compact)
    setCaret(pos)
  }

  /** 数字の行のキー。カーソル位置(選択があれば、その範囲)に1文字入れる。打ったときと同じ経路を通す */
  const typeKey = (key: string, replacePrev = false) => {
    const ta = taRef.current
    const to = ta?.selectionEnd ?? caret
    let from = ta?.selectionStart ?? caret
    // フルキーの、続けて2回押したとき: 1回目に打った文字を置き換える(- - → ,)
    if (replacePrev && from === to && from > 0) from -= 1
    const value = text.slice(0, from) + key + text.slice(to)
    pendingCaret.current = from + key.length
    handleChange(value, from + key.length)
  }

  /** 数字の行の ⌫。カーソルの前の1文字(選択があれば、その範囲)を消す。打ったときと同じ経路を通す */
  const backspace = () => {
    const ta = taRef.current
    const to = ta?.selectionEnd ?? caret
    let from = ta?.selectionStart ?? caret
    if (from === to) {
      if (from === 0) return
      // サロゲートペア(絵文字など)は、2つで1文字
      const low = text.charCodeAt(from - 1)
      from -= low >= 0xdc00 && low <= 0xdfff && from >= 2 ? 2 : 1
    }
    pendingCaret.current = from
    handleChange(text.slice(0, from) + text.slice(to), from)
  }

  /** `source` のログから、ファイルを生成してダウンロードする */
  const generateNow = useCallback(
    async (source: string) => {
      try {
        const zip = await generateFleZip(source)
        const name = exportName(await logFileStem(source), new Date(), 'zip')
        download(new Blob([zip as BlobPart], { type: 'application/zip' }), name)
        if (view?.status === 'ERR') {
          notify(t('notice.errorsFile'))
        }
      } catch (err) {
        notify(err instanceof Error ? err.message : t('notice.generateFailed'))
      }
    },
    [view, notify, t]
  )

  /** FLE のログを、そのままテキストで保存する(あとで「FLEログを開く」で読める) */
  const saveFle = async () => {
    const name = exportName(await logFileStem(text), new Date(), 'txt')
    download(new Blob([text], { type: 'text/plain;charset=utf-8' }), name)
  }

  /** 生成: 先に、足りない情報(自局のコールサイン・運用場所・グリッド)を調べ、あれば知らせる */
  const handleGenerate = useCallback(async () => {
    try {
      // 確かめるのは、必須の項目(日付・自局)が抜けているときだけ。グリッドや運用場所(推奨)では止めない
      const warnings = (await checkOutput(text)).filter((w) => w.severity === 'required')
      if (warnings.length > 0) {
        setCheck(warnings)
        return
      }
    } catch {
      // 調べられなくても、生成は止めない
    }
    await generateNow(text)
  }, [text, generateNow])

  /** 足りない情報を、ログの先頭に書き込んでから生成する(書式の検証と行づくりはコア) */
  const writeAndGenerate = async (values: { mycall: string; grid: string }): Promise<FieldError[]> => {
    const plan = await stationPlan(text, 0, {
      mycall: values.mycall,
      sota: '',
      pota: [],
      wwff: '',
      grid: values.grid,
    })
    if (plan.errors.length > 0) return plan.errors
    let next = text
    let nextCaret = caret
    if (plan.edits.length > 0) {
      next = applyEdits(text, plan.edits)
      nextCaret = mapCaret(caret, plan.edits)
    }
    // 日付がないログは、今日の日付(端末の日付)を先頭に書く。書式はコアの文法どおり(date YYYY-MM-DD)
    if (check?.some((w) => w.field === 'date')) {
      const d = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const line = `date ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}\n`
      next = line + next
      nextCaret += line.length
    }
    if (next !== text) {
      setText(next)
      setCaret(nextCaret)
    }
    saveLastCall(values.mycall)
    setCheck(null)
    await generateNow(next)
    return []
  }

  /** 設定画面での変更。時間帯は、ログの時刻も合わせる(同期で届いた設定は、ここを通らない) */
  const changeSettings = (patch: Partial<Settings>) => {
    const tz = patch.timezone
    if (tz === undefined || tz === settings.timezone || !view) {
      updateSettings(patch)
      return
    }
    const plan = planTzChange(text, view, tz)
    if (plan.kind === 'ask') {
      setRetime({ tz, from: plan.from, to: plan.to, qsos: plan.qsos })
      return
    }
    updateSettings(patch)
    if (plan.kind === 'rewrite') void retimeLog(text, tz, false).then((next) => next !== text && setText(next))
  }

  const applyRetime = async (convert: boolean) => {
    if (!retime) return
    const { tz } = retime
    setRetime(null)
    updateSettings({ timezone: tz })
    const next = await retimeLog(text, tz, convert)
    const zone = zoneLabel(tz) || 'UTC'
    if (next !== text) replaceText(next, t(convert ? 'notice.retimed' : 'notice.relabeled', { zone }))
  }

  const readFile = (e: React.ChangeEvent<HTMLInputElement>, onText: (content: string) => void) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onText(String(reader.result))
    reader.readAsText(file, 'UTF-8')
  }

  return (
    <FieldKeysContext.Provider value={fieldKeys}>
      <div className={`fixed inset-x-0 top-[var(--vvt,0px)] h-[var(--vvh,100dvh)] max-w-3xl mx-auto px-3 ${
        // フルキーでは、キーボードが出ている間は、ホームバーの分の余白を取らない(キーとキーボードの間が空く)
        compact && keyboard ? 'pb-2' : 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'
      } flex flex-col gap-2`}>
        <Header
          onMenu={() => setMenuOpen(true)}
          settings={settings}
          onSettingsChange={changeSettings}
          sync={sync}
        />

        <div ref={clockRoom.boxRef} className={`relative flex-1 min-h-0 flex ${compact ? 'flex-col justify-end' : ''}`}>
          {clockRoom.fits && (
            <StationClock info={info} tz={clockZone(info, view, caretLine, settings.timezone)} memo={memoAt(text, caretLine)} />
          )}
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => handleChange(e.target.value, e.target.selectionStart)}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            // Ctrl+Z / ⌘Z は、↶ と同じ取り消し(ブラウザの取り消しは、確定や候補で書き換えた分を戻せない)
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                undo()
              }
            }}
            placeholder={t('editor.placeholder')}
            aria-label={t('editor.label')}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            // フルキー: OS のキーボードを出さない(キャレットは出る)
            inputMode={onScreenKeys ? 'none' : undefined}
            // 従来の配置では、下端に重なる補完候補の分だけ、末尾の行が隠れないよう余白を取る。
            // 文字は太め(細い文字は、日なたで読めない)。ゴシックは本文と同じフォントを引き継ぐ
            // フルキーでは、緑のバーのコールサインと同じ大きさ(目が読み替えずに済む)。行間は詰める
            className={`input flex-1 h-full min-h-0 resize-none font-semibold ${
              compact ? '!text-xl leading-[1.3]' : 'leading-relaxed pb-20'
            } ${settings.editorFont === 'mono' ? 'font-mono' : ''}`}
          />
          {!compact && <SuggestStrip candidates={completion.candidates} onPick={pick} />}
        </div>

        {/* フルキーでは、補完候補は候補バーに重ねて出す(打っている行のすぐ下) */}
        <div className="relative flex-none">
          <CandidateBar
            view={view}
            preview={preview}
            info={info}
            caretLine={caretLine}
            timezone={settings.timezone}
            count={settings.qsoCount}
            autoTime={settings.autoTime}
            lineText={text.slice(...lineRange(text, caretLine))}
            compact={compact}
            suggest={compact && <SuggestStrip candidates={completion.candidates} onPick={pick} overBar />}
            onOpenList={() => setListOpen(true)}
            onConfirm={confirmLine}
            onSelectPart={caretToPart}
          />
        </div>

        {/* 数字の行は一番下。ソフトキーボードのすぐ上で、指が近い */}
        {onScreenKeys ? (
          <FullKeyboard
            onKey={typeKey}
            onMove={moveCaret}
            onBackspace={backspace}
            // エディタの Enter と同じく、カーソルの位置で改行する(行の途中なら行を割る。時刻などは書かない。書くのは OK)
            onNewline={() => typeKey('\n')}
            onOsKeyboard={() => setOsKeyboard(true)}
            onUndo={undo}
            keyScale={settings.keyScale}
            onKeyScale={(keyScale) => updateSettings({ keyScale })}
            caps={settings.capsLock}
            onToggleCaps={() => updateSettings({ capsLock: !settings.capsLock })}
          />
        ) : fullkey ? (
          // OS のキーボードを使っている間: フルキーに戻るボタン(数字キーは、OS のキーボードにある)
          <button
            type="button"
            {...keepFocus}
            onClick={() => setOsKeyboard(false)}
            className="flex-none h-11 rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-gray-200 dark:bg-gray-800 font-bold text-sm flex items-center justify-center gap-2 active:bg-gray-300 dark:active:bg-gray-700"
          >
            <Keyboard className="w-5 h-5" aria-hidden="true" />
            {t('keys.back')}
          </button>
        ) : (
          settings.digitRow && <DigitRow onKey={typeKey} onMove={moveCaret} />
        )}

        {landscape && (
          // 横向きのスマホ: 縦にしてもらう(ログはそのまま)
          <div
            role="alert"
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-6 text-center bg-white text-gray-950 dark:bg-gray-950 dark:text-gray-50"
          >
            <Smartphone className="w-12 h-12" aria-hidden="true" />
            <p className="text-lg font-bold">{t('landscape.title')}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{t('landscape.hint')}</p>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="absolute left-1/2 -translate-x-1/2 bottom-28 w-max max-w-[calc(100%-1.5rem)] px-4 py-2.5 rounded-xl font-semibold text-center bg-gray-950 text-white dark:bg-white dark:text-gray-950"
          >
            {notice}
            {undoTo !== null && (
              <button
                type="button"
                className="ml-3 underline font-bold"
                onClick={() => {
                  setText(undoTo)
                  setNotice(null)
                }}
              >
                {t('notice.undo')}
              </button>
            )}
          </div>
        )}

        <input
          ref={fleInputRef}
          type="file"
          accept=".txt,.fle"
          className="hidden"
          onChange={(e) =>
            readFile(e, (content) =>
              replaceText(content, t('notice.loaded'))
            )
          }
        />
        <input
          ref={adifInputRef}
          type="file"
          accept=".adi,.adif"
          className="hidden"
          onChange={(e) =>
            readFile(e, async (content) => {
              // ADIFの読み方(FLEの書式への変換)はコアが知っている
              const fle = await adifToFle(content)
              setText((prev) => (prev && !prev.endsWith('\n') ? prev + '\n' : prev) + fle)
            })
          }
        />

        <QsoSheet
          open={listOpen}
          onClose={() => setListOpen(false)}
          view={view}
          text={text}
          onJump={jump}
        />

        <RetimeSheet
          open={retime !== null}
          onClose={() => setRetime(null)}
          zone={retime ? zoneLabel(retime.tz) || 'UTC' : ''}
          from={retime?.from ?? ''}
          to={retime?.to ?? ''}
          qsos={retime?.qsos ?? 0}
          onConvert={() => void applyRetime(true)}
          onKeep={() => void applyRetime(false)}
        />

        <GenerateCheckSheet
          open={check !== null}
          onClose={() => setCheck(null)}
          warnings={check ?? []}
          initialCall={loadLastCall()}
          onWriteAndGenerate={writeAndGenerate}
          onGenerateAnyway={() => {
            setCheck(null)
            void generateNow(text)
          }}
          onOpenPlace={() => {
            setCheck(null)
            void openPlace(0)
          }}
        />

        <PlaceSheet
          open={place !== null}
          onClose={() => setPlace(null)}
          initial={place?.initial ?? { mycall: '', sota: '', pota: [], wwff: '', grid: '' }}
          initialMemo={place?.memo ?? ''}
          isNewLog={place?.isNewLog ?? true}
          fresh={place?.fresh}
          replacing={place?.fresh && text.trim() !== ''}
          onApply={applyPlace}
          plans={plansStore.plans}
        />

        <PlanSheet
          open={plansOpen}
          onClose={() => setPlansOpen(false)}
          plans={plansStore.plans}
          onSave={plansStore.save}
          onRemove={plansStore.remove}
        />

        <JoinSheet
          code={joinCode}
          onJoin={sync.joinWith}
          onClose={() => {
            setJoinCode(null)
            history.replaceState(null, '', window.location.pathname + window.location.search)
          }}
        />

        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t('menu.title')}>
          <MenuGroup title={t('menu.group.before')}>
            <MenuButton icon={FilePlus} label={t('menu.place')} onClick={fromMenu(openNewLog)} />
            {hasText && <MenuButton icon={MapPin} label={t('menu.change')} onClick={fromMenu(() => void openPlace())} />}
            <MenuButton icon={ClipboardList} label={t('menu.plans')} onClick={fromMenu(() => setPlansOpen(true))} />
          </MenuGroup>
          {/* フルキーでは、QSO の数は表示だけ。一覧はここから */}
          {compact && (
            <MenuGroup title={t('menu.group.log')}>
              <MenuButton icon={List} label={t('menu.list')} onClick={fromMenu(() => setListOpen(true))} />
            </MenuGroup>
          )}
          <MenuGroup title={t('menu.group.output')}>
            <MenuButton icon={Download} label={t('menu.export')} disabled={!hasText} onClick={fromMenu(() => void handleGenerate())} />
            <MenuButton icon={Save} label={t('menu.saveFle')} disabled={!hasText} onClick={fromMenu(() => void saveFle())} />
          </MenuGroup>
          <MenuGroup title={t('menu.group.input')}>
            <MenuButton icon={Upload} label={t('menu.openFle')} onClick={fromMenu(() => fleInputRef.current?.click())} />
            <MenuButton icon={FileText} label={t('menu.addAdif')} onClick={fromMenu(() => adifInputRef.current?.click())} />
          </MenuGroup>
          <MenuGroup title={t('menu.group.edit')}>
            {prev && prev !== text && <MenuButton icon={Undo2} label={t('menu.undo')} onClick={fromMenu(() => replaceText(prev))} />}
            <MenuButton icon={Trash2} label={t('menu.clear')} onClick={fromMenu(() => replaceText('', t('notice.cleared')))} />
          </MenuGroup>
          <MenuGroup title={t('menu.group.help')}>
            <li>
              <a href={lang === 'en' ? MANUAL_URL_EN : MANUAL_URL} target="_blank" rel="noopener noreferrer" className={MENU_ITEM}>
                <HelpCircle className="w-5 h-5" />
                {t('menu.help')}
              </a>
            </li>
            <MenuButton
              icon={BookOpen}
              label={t('menu.sample')}
              onClick={fromMenu(() =>
                // 見本のログはコアが持つ。日付(いま)だけ、画面が渡す
                void sampleLog(new Date().toISOString().slice(0, 10)).then((sample) =>
                  replaceText(sample, t('notice.sampleInserted'))
                )
              )}
            />
            {pwa.canInstall && <MenuButton icon={Home} label={t('menu.install')} onClick={fromMenu(() => pwa.install())} />}
            {pwa.showIosHint && (
              <li className="p-3 rounded-xl border-2 border-gray-300 dark:border-gray-700 text-sm">
                <Home className="inline w-4 h-4 mr-1 align-text-bottom" />
                {t('menu.installIos')}
              </li>
            )}
          </MenuGroup>
          <p className="mt-3 text-center text-xs text-gray-700 dark:text-gray-300 font-mono">{__APP_VERSION__}</p>
        </Sheet>
      </div>
    </FieldKeysContext.Provider>
  )
}

/** ファイルとしてダウンロードさせる */
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** メニューの項目 */
function MenuButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <li>
      <button type="button" className={MENU_ITEM} onClick={onClick} disabled={disabled}>
        <Icon className="w-5 h-5" />
        {label}
      </button>
    </li>
  )
}

/** メニューの見出しと、その項目 */
function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3 first:mt-0">
      <h3 className="px-1 mb-1 text-xs font-bold text-gray-700 dark:text-gray-300">{title}</h3>
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}
