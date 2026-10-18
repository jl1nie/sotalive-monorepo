import { useState, useRef, useCallback } from 'react'
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

export function FLEOnlineTab() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [compileResult, setCompileResult] = useState<FLECompileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [textDirty, setTextDirty] = useState(false)
  const [textInterpreted, setTextInterpreted] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('sota')

  const fleFileInputRef = useRef<HTMLInputElement>(null)
  const adifFileInputRef = useRef<HTMLInputElement>(null)

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
        setTextInterpreted(false)
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
      setTextInterpreted(false)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }, [adif2fle])

  // Handle text change
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    setTextDirty(true)
    setTextInterpreted(false)
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
      setTextInterpreted(data.status === 'OK')

      if (data.status === 'ERR') {
        setError('FLEログにエラーがあります')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [text])

  // Handle generate (CSVファイル生成)
  const handleGenerate = useCallback(async () => {
    if (!textInterpreted) {
      if (!confirm('変換されていません\nCSV生成しますか？')) {
        return
      }
    }

    try {
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
    }
  }, [text, textInterpreted])

  // Handle load sample
  const handleLoadSample = useCallback(() => {
    if (textDirty) {
      if (!confirm('FLEログをクリアします')) {
        return
      }
    }
    setText(generateSample())
    setTextDirty(false)
    setTextInterpreted(false)
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
    setTextInterpreted(false)
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

  const hasSOTA = compileResult?.mysota && compileResult.mysota !== ''
  const hasWWFF =
    (compileResult?.mywwff && compileResult.mywwff !== '') ||
    (compileResult?.mypota && compileResult.mypota.length > 0)

  return (
    <div className="max-w-6xl mx-auto">
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">FLE Online Editor</h2>
          <a
            href="https://jl1nie.wordpress.com/2019/08/21/2019-08-21-203013/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-1 text-sm py-1 px-2"
          >
            <HelpCircle className="w-4 h-4" />
            Help
          </a>
        </div>

        {/* Preview Table Section */}
        <div className="mb-4">
          {/* Tab switcher */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 mb-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreviewMode('sota')}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  previewMode === 'sota'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                SOTA/WWFF/POTA
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('hamlog')}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  previewMode === 'hamlog'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                HAMLOG
              </button>
            </div>

            {/* Status indicators */}
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={hasSOTA || false} disabled className="w-3 h-3" />
                <span className="font-medium">SOTA</span>
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={hasWWFF || false} disabled className="w-3 h-3" />
                <span className="font-medium">WWFF/POTA</span>
              </label>
            </div>
          </div>

          {/* Preview Table */}
          <div className="overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg h-[35vh] min-h-[100px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                <tr>
                  {(previewMode === 'sota' ? sotaHeaders : hamlogHeaders).map((header, i) => (
                    <th
                      key={i}
                      className="px-2 py-1 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {compileResult && compileResult.status === 'OK' ? (
                  (previewMode === 'sota' ? compileResult.logtext : compileResult.hamlogtext).map(
                    (row, i) => (
                      <tr
                        key={i}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className="px-2 py-1 text-gray-900 dark:text-gray-100 whitespace-nowrap"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    )
                  )
                ) : compileResult && compileResult.status === 'ERR' ? (
                  compileResult.logtext.map((row, i) => (
                    <tr key={i} className="bg-red-50 dark:bg-red-900/20">
                      <td className="px-2 py-1 text-red-600 dark:text-red-400">Line {row[0]}</td>
                      <td
                        colSpan={previewMode === 'sota' ? 14 : 11}
                        className="px-2 py-1 text-red-600 dark:text-red-400"
                      >
                        {row[1]}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={previewMode === 'sota' ? 15 : 12}
                      className="px-4 py-8 text-center text-gray-400 dark:text-gray-500"
                    >
                      FLEログを入力して「変換」をクリックしてください
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* FLE Text Editor */}
        <div className="mb-4">
          <textarea
            value={text}
            onChange={handleTextChange}
            placeholder="FLE形式のログを入力..."
            className="input font-mono text-sm min-h-[40vh] resize-none"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Success message */}
        {compileResult && compileResult.status === 'OK' && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <div className="text-sm">
              <span className="font-medium">変換成功!</span>
              <span className="ml-2">
                {compileResult.logtext.length} QSO | mycall: {compileResult.mycall}
                {compileResult.mysota && ` | SOTA: ${compileResult.mysota}`}
                {compileResult.mywwff && ` | WWFF: ${compileResult.mywwff}`}
                {compileResult.mypota.length > 0 && ` | POTA: ${compileResult.mypota.join(', ')}`}
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* File inputs (hidden) */}
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

          <button
            type="button"
            onClick={() => fleFileInputRef.current?.click()}
            className="btn-secondary flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            FLEログ読込
          </button>

          <button
            type="button"
            onClick={() => adifFileInputRef.current?.click()}
            className="btn-secondary flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            ADIFログ追加
          </button>

          <button
            type="button"
            onClick={handleCompile}
            disabled={!text.trim() || loading}
            className="btn-info flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            変換
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!text.trim()}
            className="btn-primary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            CSVファイル生成
          </button>

          <button
            type="button"
            onClick={handleLoadSample}
            className="btn-secondary flex items-center gap-2"
          >
            FLE Sample
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="btn-secondary flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}
