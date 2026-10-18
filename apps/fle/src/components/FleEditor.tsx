import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Play,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle,
  Upload,
  FileText,
  HelpCircle,
} from 'lucide-react'
import { compileFle, generateFleZip, type FleCompileView } from '@/lib/fle'

type FLECompileResponse = FleCompileView

type PreviewMode = 'sota' | 'hamlog'

export function FleEditor() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [compileResult, setCompileResult] = useState<FLECompileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [textDirty, setTextDirty] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('sota')

  const fleFileInputRef = useRef<HTMLInputElement>(null)
  const adifFileInputRef = useRef<HTMLInputElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)

  // 変換後は結果(成功・エラー)が見える位置まで移動する。スマホでは入力欄の下にあるため。
  // 結果の描画が済んでからでないと、ページが短くてスクロール先が打ち切られる。
  const [resultTick, setResultTick] = useState(0)
  const showResult = useCallback(() => setResultTick((t) => t + 1), [])
  useEffect(() => {
    if (resultTick > 0) {
      statusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [resultTick])

  // ADIF to FLE converter
  const adif2fle = useCallback((adifText: string): string => {
    const records = adifText.toUpperCase().split('<EOR>')
    let today = ''
    let mode = ''
    let band = ''
    let result = ''

    for (const elem of records) {
      let qso = ''
      const call = elem.match(/<CALL:\d+>([A-Z0-9/]+)[\s<]/)
      if (!call) continue

      const newmode = elem.match(/<MODE:\d+>(\S+)[\s<]/)
      const newband = elem.match(/<BAND:\d+>([0-9]+[A-Z]+)/)
      const newday = elem.match(/<QSO_DATE:\d+>(\d+)[\s<]/)
      const time = elem.match(/<TIME_ON:\d+>(\d+)[\s<]/)
      const sent = elem.match(/<RST_SENT:\d+>([0-9+-]+)[\s<]/)
      const recv = elem.match(/<RST_RCVD:\d+>([0-9+-]+)[\s<]/)

      if (!newday || !time) continue

      if (newday[1] !== today) {
        const d = newday[1]
        qso += `date ${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}\r\n`
        today = newday[1]
      }
      if ((newband && newband[1] !== band) || (newmode && newmode[1] !== mode)) {
        if (newband) band = newband[1]
        if (newmode) mode = newmode[1]
        qso += `${band.toLowerCase()} ${mode}\r\n`
      }
      const rstSent = sent ? sent[1] : '599'
      const rstRecv = recv ? recv[1] : '599'
      qso += `${time[1].substring(0, 4)} ${call[1]} ${rstSent} ${rstRecv}\r\n`

      result += qso
    }
    return result
  }, [])

  // Generate sample FLE text
  const generateSample = useCallback(() => {
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`

    return `#Header
mycall jl1nie/0
operator jl1nie
mywwff jaff-0218
mypota jp-1151 jp-1164
mysota ja/st-012
qslmsg $sat丸山$mysota $mypota $rig
#Log
timezone +0
date ${dateStr}
rigset 1
40m cw
2302 ja1qsa
4 ja4qru 6 7 <曽田さん>{島根市}
4 ja8qsw 4 {札幌市}
ssb
14 ja4qsy
40 jq1qso/1 5 3 jaff-0218 ja-1151 ja-1164
70cm fm
55 jg0qro/0 ja/nn-001 {松本市 AO-91/FM/144MHz}
58 jk2qsu {PM85rl AO-91/FM/144MHz}
day +
17m cw
rigset 0
04 zl1qsb 41 31
20m ft4
45 zl1qrz -18 -19
rigset 2
50.550 am
0130 jj1qth 3 4`
  }, [])

  // Handle FLE file load
  const handleFleFileLoad = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (textDirty) {
        if (!confirm('修正されたFLEログがクリアされます')) {
          e.target.value = ''
          return
        }
      }

      const reader = new FileReader()
      reader.onload = () => {
        setText(reader.result as string)
        setTextDirty(false)
        setCompileResult(null)
        setError(null)
      }
      reader.readAsText(file, 'UTF-8')
      e.target.value = ''
    },
    [textDirty]
  )

  // Handle ADIF file append
  const handleAdifFileLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const adifContent = reader.result as string
      const fleContent = adif2fle(adifContent)
      setText((prev) => prev + fleContent)
      setTextDirty(true)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }, [adif2fle])

  // Handle text change
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    setTextDirty(true)
  }, [])

  // Handle compile (変換)
  const handleCompile = useCallback(async () => {
    if (!text.trim()) {
      setError('FLEログを入力してください')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await compileFle(text)
      setCompileResult(data)

      if (data.status === 'ERR') {
        setError('FLEログにエラーがあります')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
      showResult()
    }
  }, [text, showResult])

  // Handle generate (CSVファイル生成)
  const handleGenerate = useCallback(async () => {
    setError(null)
    try {
      // 変換は端末内で一瞬なので、生成の前に毎回変換して画面の結果も最新にする
      const view = await compileFle(text)
      setCompileResult(view)
      if (view.status === 'ERR') {
        setError('FLEログにエラーがあります(エラー内容を書いたファイルを生成します)')
      }

      const zip = await generateFleZip(text)
      const blob = new Blob([zip as BlobPart], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fle.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ダウンロードに失敗しました')
    } finally {
      showResult()
    }
  }, [text, showResult])

  // Handle load sample
  const handleLoadSample = useCallback(() => {
    if (textDirty) {
      if (!confirm('FLEログをクリアします')) {
        return
      }
    }
    setText(generateSample())
    setTextDirty(false)
    setCompileResult(null)
    setError(null)
  }, [textDirty, generateSample])

  // Handle clear
  const handleClear = useCallback(() => {
    if (textDirty) {
      if (!confirm('FLEログをクリアします')) {
        return
      }
    }
    setText('')
    setTextDirty(false)
    setCompileResult(null)
    setError(null)
  }, [textDirty])

  // SOTA/JAFF/POTA preview table headers
  const sotaHeaders = [
    'No.',
    'My Call',
    'Date',
    'Time',
    'Call',
    'Band',
    'Mode',
    'RSTs',
    'RSTr',
    'My SOTA',
    'His SOTA',
    'My SigInfo',
    'His SigInfo',
    'Comment',
    'Operator',
  ]

  // HAMLOG preview table headers
  const hamlogHeaders = [
    'No.',
    'Call',
    'Date',
    'Time',
    'His',
    'My',
    'Freq',
    'Mode',
    'GL',
    'Name',
    'QTH',
    'Remarks2',
  ]

  const isOk = compileResult?.status === 'OK'
  const isErr = compileResult?.status === 'ERR'
  const qsoRows = compileResult?.logtext ?? []
  const tableRows = previewMode === 'sota' ? qsoRows : (compileResult?.hamlogtext ?? [])
  const headers = previewMode === 'sota' ? sotaHeaders : hamlogHeaders

  const refChips = compileResult
    ? [
        compileResult.mycall && `mycall ${compileResult.mycall}`,
        compileResult.mysota && `SOTA ${compileResult.mysota}`,
        compileResult.mywwff && `WWFF ${compileResult.mywwff}`,
        compileResult.mypota.length > 0 && `POTA ${compileResult.mypota.join(' ')}`,
      ].filter(Boolean)
    : []

  return (
    <div className="max-w-3xl md:max-w-6xl mx-auto space-y-4">
      {/* 入力 */}
      <section className="card p-4" aria-labelledby="fle-input-title">
        <div className="flex items-center justify-between mb-3">
          <h2 id="fle-input-title" className="text-xl font-bold">
            FLE ログ入力
          </h2>
          <a
            href="https://jl1nie.wordpress.com/2019/08/21/2019-08-21-203013/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary !min-h-11 !px-3"
            aria-label="FLEの書き方(ヘルプ)"
          >
            <HelpCircle className="w-5 h-5" />
            ヘルプ
          </a>
        </div>

        <textarea
          value={text}
          onChange={handleTextChange}
          placeholder={'mycall JA1ABC/1\nmysota JA/TK-001\n40m cw\n0900 JA1XYZ 599 599'}
          aria-label="FLE形式のログ"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          className="input font-mono leading-relaxed min-h-[42dvh] md:min-h-[40vh] resize-y"
        />

        <input
          ref={fleFileInputRef}
          type="file"
          accept=".txt,.fle"
          onChange={handleFleFileLoad}
          className="hidden"
        />
        <input
          ref={adifFileInputRef}
          type="file"
          accept=".adi,.adif"
          onChange={handleAdifFileLoad}
          className="hidden"
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <button type="button" onClick={() => fleFileInputRef.current?.click()} className="btn-secondary">
            <Upload className="w-5 h-5" />
            FLE読込
          </button>
          <button type="button" onClick={() => adifFileInputRef.current?.click()} className="btn-secondary">
            <FileText className="w-5 h-5" />
            ADIF追加
          </button>
          <button type="button" onClick={handleLoadSample} className="btn-secondary">
            サンプル
          </button>
          <button type="button" onClick={handleClear} className="btn-secondary">
            <Trash2 className="w-5 h-5" />
            クリア
          </button>
        </div>
      </section>

      {/* 状態表示 */}
      <div ref={statusRef} aria-live="polite" className="space-y-2 scroll-mt-20">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 p-4 rounded-xl border-2 border-red-700 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100 dark:border-red-400"
          >
            <AlertCircle className="w-6 h-6 shrink-0" />
            <p className="font-semibold">{error}</p>
          </div>
        )}
        {isOk && (
          <div className="flex items-start gap-3 p-4 rounded-xl border-2 border-emerald-700 bg-emerald-50 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-400">
            <CheckCircle className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold">変換できました: {qsoRows.length} QSO</p>
              {refChips.length > 0 && (
                <p className="text-sm font-medium break-words">{refChips.join(' / ')}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 結果 */}
      {compileResult && (
        <section className="card p-4" aria-labelledby="fle-result-title">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 id="fle-result-title" className="text-xl font-bold">
              {isErr ? `エラー ${qsoRows.length}件` : '変換結果'}
            </h2>
            {isOk && (
              <div className="hidden md:flex rounded-xl border-2 border-gray-400 overflow-hidden" role="group" aria-label="表示形式">
                {(['sota', 'hamlog'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPreviewMode(mode)}
                    aria-pressed={previewMode === mode}
                    className={`px-4 min-h-11 font-semibold ${
                      previewMode === mode
                        ? 'bg-primary-700 text-white'
                        : 'bg-white text-gray-950 dark:bg-gray-900 dark:text-gray-50'
                    }`}
                  >
                    {mode === 'sota' ? 'SOTA/WWFF/POTA' : 'HAMLOG'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isErr ? (
            <ul className="space-y-2">
              {qsoRows.map((row, i) => (
                <li
                  key={i}
                  className="p-3 rounded-xl border-2 border-red-700 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100 dark:border-red-400"
                >
                  <span className="font-bold">{Number(row[0]) + 1}行目</span>
                  <span className="ml-2">{row[1]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <>
              {/* スマホ: QSOごとのカード */}
              <ol className="md:hidden space-y-2">
                {qsoRows.map((row, i) => (
                  <li key={i} className="p-3 rounded-xl border-2 border-gray-300 dark:border-gray-700">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xl font-bold">{row[4]}</span>
                      <span className="font-semibold">
                        {row[5]} {row[6]}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-3 text-sm font-medium text-gray-800 dark:text-gray-200">
                      <span className="font-mono">
                        {row[2]} {row[3]}
                      </span>
                      <span className="font-mono">
                        {row[7]}/{row[8]}
                      </span>
                      {[row[10], row[12]].filter(Boolean).map((r) => (
                        <span key={r} className="font-mono font-bold text-primary-800 dark:text-primary-300">
                          {r}
                        </span>
                      ))}
                    </div>
                    {row[13] && <p className="text-sm mt-1 break-words">{row[13]}</p>}
                  </li>
                ))}
              </ol>

              {/* PC: 表 */}
              <div className="hidden md:block overflow-auto border-2 border-gray-300 dark:border-gray-700 rounded-xl max-h-[45vh]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                    <tr>
                      {headers.map((header) => (
                        <th key={header} className="px-3 py-2 text-left font-bold whitespace-nowrap">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {tableRows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 whitespace-nowrap">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* 操作バー: 画面下に固定(スマホは下部ナビの上) */}
      <div className="sticky bottom-0 z-20 -mx-4 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-white dark:bg-gray-950 border-t-2 border-gray-300 dark:border-gray-700">
        <div className="max-w-3xl md:max-w-6xl mx-auto grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleCompile}
            disabled={!text.trim() || loading}
            className="btn-primary"
          >
            <Play className="w-5 h-5" />
            変換
          </button>
          <button type="button" onClick={handleGenerate} disabled={!text.trim()} className="btn-success">
            <Download className="w-5 h-5" />
            ファイル生成
          </button>
        </div>
      </div>
    </div>
  )
}
