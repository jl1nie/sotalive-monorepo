import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FileText, HelpCircle, Home, RefreshCw, Trash2, Undo2, Upload } from 'lucide-react'
import {
  compileLog,
  completeAt,
  fillLine,
  generateFleZip,
  type Candidate,
  type LogView,
} from '@/lib/fle'
import { adif2fle } from '@/lib/adif'
import { generateSample } from '@/lib/sample'
import { lineOf, lineRange, replaceToken } from '@/lib/lines'
import { applyEdits, mapCaret } from '@/lib/edits'
import { loadLog, loadPrev, rememberPrev } from '@/lib/storage'
import { useVisualViewport } from '@/hooks/useVisualViewport'
import { useAutosave } from '@/hooks/useAutosave'
import { usePwa } from '@/hooks/usePwa'
import { useSettings } from '@/hooks/useSettings'
import { Header } from '@/components/Header'
import { CandidateBar } from '@/components/CandidateBar'
import { SuggestStrip } from '@/components/SuggestStrip'
import { QsoSheet } from '@/components/QsoSheet'
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
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
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
      .then((c) => current && setCandidates(c))
      .catch(() => current && setCandidates([]))
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
      const next = replaceToken(text, caret, candidate.text)
      pendingCaret.current = next.caret
      setText(next.text)
      setCaret(next.caret)
    },
    [text, caret]
  )

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

  // Enterで、その行の補完(時刻)をテキストに確定してから改行する
  const handleEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    const ta = e.currentTarget
    if (ta.selectionStart !== ta.selectionEnd) return
    const pos = ta.selectionStart
    const line = lineOf(text, pos)
    // 行の途中での改行は、行を分けるだけ
    if (pos !== lineRange(text, line)[1]) return

    const startedAt = lineStartedAt.current?.line === line ? lineStartedAt.current.ms : Date.now()
    const edits = fillLine(text, line, startedAt, settings.timezone)
    if (edits.length === 0) return // 通常の改行

    e.preventDefault()
    const filled = applyEdits(text, edits)
    const at = mapCaret(pos, edits)
    lineStartedAt.current = null
    pendingCaret.current = at + 1
    setText(filled.slice(0, at) + '\n' + filled.slice(at))
    setCaret(at + 1)
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
          onChange={(e) => {
            const value = e.target.value
            const pos = e.target.selectionStart
            const line = lineOf(value, pos)
            const [start, end] = lineRange(value, line)
            if (value.slice(start, end).trim() === '') lineStartedAt.current = null
            else if (lineStartedAt.current?.line !== line) {
              lineStartedAt.current = { line, ms: Date.now() }
            }
            setText(value)
            setCaret(pos)
          }}
          onKeyDown={handleEnter}
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
        <SuggestStrip candidates={candidates} onPick={pick} />
      </div>

      <CandidateBar view={view} caretLine={caretLine} onOpenList={() => setListOpen(true)} />

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
          readFile(e, (content) =>
            setText((prev) => (prev && !prev.endsWith('\n') ? prev + '\n' : prev) + adif2fle(content))
          )
        }
      />

      <QsoSheet open={listOpen} onClose={() => setListOpen(false)} view={view} onJump={jump} />

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="ログ">
        <ul className="space-y-2">
          {pwa.updateReady && (
            <li>
              <button
                type="button"
                className="btn-primary w-full !justify-start !min-h-14"
                onClick={() => pwa.applyUpdate()}
              >
                <RefreshCw className="w-5 h-5" />
                新しい版に更新する
              </button>
            </li>
          )}
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
                replaceText(generateSample(), 'サンプルを入れました。メニューから元に戻せます')
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
      </Sheet>
    </div>
  )
}
