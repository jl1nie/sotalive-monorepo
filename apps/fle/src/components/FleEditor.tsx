import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FileText, HelpCircle, Home, MapPin, Trash2, Undo2, Upload } from 'lucide-react'
import {
  compileLog,
  completeAt,
  fillLine,
  generateFleZip,
  adifToFle,
  sampleLog,
  stationAt,
  stationPlan,
  type Station,
  type Candidate,
  type Completion,
  type FieldError,
  type LogView,
  type QsoView,
} from '@/lib/fle'
import { lineOf, lineRange, replaceRange } from '@/lib/lines'
import { applyEdits, mapCaret } from '@/lib/edits'
import { loadLastCall, loadLog, loadPrev, rememberPrev, saveLastCall } from '@/lib/storage'
import { useVisualViewport } from '@/hooks/useVisualViewport'
import { useAutosave } from '@/hooks/useAutosave'
import { usePwa } from '@/hooks/usePwa'
import { useSettings } from '@/hooks/useSettings'
import { Header } from '@/components/Header'
import { CandidateBar } from '@/components/CandidateBar'
import { SuggestStrip } from '@/components/SuggestStrip'
import { QsoSheet } from '@/components/QsoSheet'
import { PlaceSheet } from '@/components/PlaceSheet'
import { Sheet } from '@/components/Sheet'

const HELP_URL = 'https://jl1nie.wordpress.com/2019/08/21/2019-08-21-203013/'

const MENU_ITEM =
  'btn-secondary w-full !justify-start !min-h-14 text-left'

export function FleEditor() {
  useVisualViewport()
  const { settings, update: updateSettings } = useSettings()

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
  // 場所のシート: どの行の前に書くか(開いた時点のカーソル行)と、初期値
  const [place, setPlace] = useState<{ line: number; initial: Station; isNewLog: boolean } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const fleInputRef = useRef<HTMLInputElement>(null)
  const adifInputRef = useRef<HTMLInputElement>(null)
  const noticeTimer = useRef<number>(0)
  // いま打っている行を、最初の1文字を打った時刻とともに覚える(その行の時刻にする)
  const lineStartedAt = useRef<{ line: number; ms: number } | null>(null)
  // 候補の確定後に置くカーソル位置。描画(コミット)の直後、次の入力より先に反映する
  const pendingCaret = useRef<number | null>(null)

  const notify = useCallback((message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000)
  }, [])

  useAutosave(
    text,
    useCallback(() => notify('自動保存できません。ブラウザの設定を確認してください'), [notify])
  )
  const pwa = usePwa(useCallback(() => notify('オフラインでも使えます'), [notify]))

  // 内容を置き換える前に、今の内容を取っておく(メニューから戻せる)
  const replaceText = useCallback(
    (next: string, message?: string) => {
      if (text.trim()) {
        rememberPrev(text)
        setPrev(text)
        if (message) notify(message)
      }
      setText(next)
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
      .catch((e) => current && notify(e instanceof Error ? e.message : '解釈に失敗しました'))
    return () => {
      current = false
    }
  }, [text, notify])

  // カーソル位置で文法上ありえるキーワードを、コアに尋ねる
  useEffect(() => {
    let current = true
    completeAt(text.slice(0, caret))
      .then((c) => current && setCompletion(c))
      .catch(() => current && setCompletion({ from: 0, candidates: [] }))
    return () => {
      current = false
    }
  }, [text, caret])

  useLayoutEffect(() => {
    const pos = pendingCaret.current
    const ta = taRef.current
    if (pos === null || !ta) return
    pendingCaret.current = null
    ta.focus()
    ta.setSelectionRange(pos, pos)
  }, [text])

  const caretLine = lineOf(text, caret)

  // 確定ボタンで何を書くか(時刻は常に。省略形の時刻も直す)。Enterは時刻の挿入だけ
  const confirmScope = {
    expandTime: true,
    bandMode: settings.writeBandMode,
    rst: settings.writeRst,
  }

  // この行を確定したら、どう見えるか(時刻・バンド・モード・RSTが入った姿)を先に見せる
  const previewKey = `${caretLine}|${settings.timezone}|${settings.writeBandMode}|${settings.writeRst}|${text}`
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

  const focusAt = useCallback((pos: number) => {
    // シートが閉じてフォーカスが戻った後に、入力欄へカーソルを置く
    window.setTimeout(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(pos, pos)
      setCaret(pos)
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

  // ログに自局のコールサインが現れたら、次の新しいログの初期値として覚える
  const logCall = view?.mycall
  useEffect(() => {
    if (logCall) saveLastCall(logCall)
  }, [logCall])

  /** 場所のシートを開く。初期値は、カーソル位置で有効な自局と場所(自局が空なら前回のもの) */
  const openPlace = async () => {
    const line = caretLine
    const current = await stationAt(text, line)
    setPlace({
      line,
      initial: { ...current, mycall: current.mycall || loadLastCall() },
      isNewLog: !view?.qsos.some((q) => q.line < line),
    })
  }

  /** 場所をログに書き込む(指令の行の書式はコアが決める)。誤りがあれば返す */
  const applyPlace = async (want: Station): Promise<FieldError[]> => {
    if (!place) return []
    const plan = await stationPlan(text, place.line, want)
    if (plan.errors.length > 0) return plan.errors
    if (plan.edits.length > 0) {
      const at = mapCaret(caret, plan.edits)
      pendingCaret.current = at
      setText(applyEdits(text, plan.edits))
      setCaret(at)
    }
    saveLastCall(want.mycall)
    setPlace(null)
    return []
  }

  const jump = useCallback(
    (line: number) => {
      setListOpen(false)
      const ta = taRef.current
      if (!ta) return
      const [, end] = lineRange(text, line)
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 26
      ta.scrollTop = Math.max(0, lineHeight * line - ta.clientHeight / 3)
      focusAt(end)
    },
    [text, focusAt]
  )

  // その行を打ち始めた時刻(覚えていなければ、いま)
  function startedAtFor(line: number) {
    return lineStartedAt.current?.line === line ? lineStartedAt.current.ms : Date.now()
  }

  /** 緑の候補バー: 時刻・バンド・モード・RSTまで確定して、次の行へ進む */
  const confirmLine = () => {
    const line = caretLine
    const edits = fillLine(text, line, startedAtFor(line), settings.timezone, confirmScope)
    const filled = applyEdits(text, edits)
    const shift = filled.split('\n').length - text.split('\n').length
    const end = lineRange(filled, line + shift)[1]
    lineStartedAt.current = null
    pendingCaret.current = end + 1
    setText(filled.slice(0, end) + '\n' + filled.slice(end))
    setCaret(end + 1)
  }

  /**
   * 入力の変化を受ける。行末で改行が1つ入ったときは、その行の補完(時刻)をテキストに確定する。
   * キーの種類(keydown)ではなくテキストの変化で判定するので、ソフトキーボードでも同じに動く。
   */
  const handleChange = (value: string, pos: number, native: Event) => {
    const composing = (native as InputEvent).isComposing === true
    const newlineAdded =
      !composing &&
      value.length === text.length + 1 &&
      value[pos - 1] === '\n' &&
      value.slice(0, pos - 1) + value.slice(pos) === text &&
      // 行末での改行だけ。行の途中で分けるだけのときは確定しない
      (pos === value.length || value[pos] === '\n')

    if (newlineAdded) {
      const done = lineOf(value, pos) - 1
      const edits = fillLine(value, done, startedAtFor(done), settings.timezone)
      if (edits.length > 0) {
        const at = mapCaret(pos, edits)
        lineStartedAt.current = null
        pendingCaret.current = at
        setText(applyEdits(value, edits))
        setCaret(at)
        return
      }
    }
    // 確定しなかったとき: いま打っている行の、最初の1文字を打った時刻を覚える
    const line = lineOf(value, pos)
    const [start, end] = lineRange(value, line)
    if (value.slice(start, end).trim() === '') lineStartedAt.current = null
    else if (lineStartedAt.current?.line !== line) lineStartedAt.current = { line, ms: Date.now() }
    setText(value)
    setCaret(pos)
  }

  const handleGenerate = useCallback(async () => {
    try {
      const zip = await generateFleZip(text)
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'fle.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      if (view?.status === 'ERR') {
        notify('エラーのある行があります。エラー内容を書いたファイルを生成しました')
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ファイルを生成できませんでした')
    }
  }, [text, view, notify])

  const readFile = (e: React.ChangeEvent<HTMLInputElement>, onText: (content: string) => void) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onText(String(reader.result))
    reader.readAsText(file, 'UTF-8')
  }

  return (
    <div className="fixed inset-x-0 top-[var(--vvt,0px)] h-[var(--vvh,100dvh)] max-w-3xl mx-auto px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex flex-col gap-2">
      <Header
        onGenerate={handleGenerate}
        canGenerate={text.trim().length > 0}
        onMenu={() => setMenuOpen(true)}
        settings={settings}
        onSettingsChange={updateSettings}
      />

      <div className="relative flex-1 min-h-0 flex">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart, e.nativeEvent)}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          placeholder="0900 JA1XYZ 599 599"
          aria-label="FLEログ"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          // 下端に重なる補完候補の分だけ、末尾の行が隠れないよう余白を取る
          className="input flex-1 h-full min-h-0 resize-none font-mono leading-relaxed pb-20"
        />
        <SuggestStrip candidates={completion.candidates} onPick={pick} />
      </div>

      <CandidateBar
        view={view}
        preview={preview}
        caretLine={caretLine}
        onOpenList={() => setListOpen(true)}
        onConfirm={confirmLine}
      />

      {notice && (
        <div
          role="status"
          className="absolute left-1/2 -translate-x-1/2 bottom-28 w-max max-w-[calc(100%-1.5rem)] px-4 py-2.5 rounded-xl font-semibold text-center bg-gray-950 text-white dark:bg-white dark:text-gray-950"
        >
          {notice}
        </div>
      )}

      <input
        ref={fleInputRef}
        type="file"
        accept=".txt,.fle"
        className="hidden"
        onChange={(e) =>
          readFile(e, (content) =>
            replaceText(content, 'ログを読み込みました。メニューから元に戻せます')
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

      <QsoSheet open={listOpen} onClose={() => setListOpen(false)} view={view} onJump={jump} />

      <PlaceSheet
        open={place !== null}
        onClose={() => setPlace(null)}
        initial={place?.initial ?? { mycall: '', sota: '', pota: [], wwff: '', grid: '' }}
        isNewLog={place?.isNewLog ?? true}
        onApply={applyPlace}
      />

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="ログ">
        <ul className="space-y-2">
          <li>
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setMenuOpen(false)
                void openPlace()
              }}
            >
              <MapPin className="w-5 h-5" />
              新しいログ・場所を設定
            </button>
          </li>
          <li>
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setMenuOpen(false)
                fleInputRef.current?.click()
              }}
            >
              <Upload className="w-5 h-5" />
              FLEログを読み込む
            </button>
          </li>
          <li>
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setMenuOpen(false)
                adifInputRef.current?.click()
              }}
            >
              <FileText className="w-5 h-5" />
              ADIFを追加
            </button>
          </li>
          <li>
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setMenuOpen(false)
                // 見本のログはコアが持つ。日付(いま)だけ、画面が渡す
                sampleLog(new Date().toISOString().slice(0, 10)).then((sample) =>
                  replaceText(sample, 'サンプルを入れました。メニューから元に戻せます')
                )
              }}
            >
              サンプルを入れる
            </button>
          </li>
          <li>
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setMenuOpen(false)
                replaceText('', '消しました。メニューから元に戻せます')
              }}
            >
              <Trash2 className="w-5 h-5" />
              すべて消す
            </button>
          </li>
          {prev && prev !== text && (
            <li>
              <button
                type="button"
                className={MENU_ITEM}
                onClick={() => {
                  setMenuOpen(false)
                  replaceText(prev)
                }}
              >
                <Undo2 className="w-5 h-5" />
                直前の内容に戻す
              </button>
            </li>
          )}
          {pwa.canInstall && (
            <li>
              <button
                type="button"
                className={MENU_ITEM}
                onClick={() => {
                  setMenuOpen(false)
                  pwa.install()
                }}
              >
                <Home className="w-5 h-5" />
                ホーム画面に追加
              </button>
            </li>
          )}
          {pwa.showIosHint && (
            <li className="p-3 rounded-xl border-2 border-gray-300 dark:border-gray-700 text-sm">
              <Home className="inline w-4 h-4 mr-1 align-text-bottom" />
              ホーム画面に追加するには、Safariの共有ボタンから「ホーム画面に追加」を選びます。
            </li>
          )}
          <li>
            <a href={HELP_URL} target="_blank" rel="noopener noreferrer" className={MENU_ITEM}>
              <HelpCircle className="w-5 h-5" />
              FLEの書き方
            </a>
          </li>
        </ul>
        <p className="mt-3 text-center text-xs text-gray-700 dark:text-gray-300">
          FLEonline 版 {__APP_VERSION__}
        </p>
      </Sheet>
    </div>
  )
}
