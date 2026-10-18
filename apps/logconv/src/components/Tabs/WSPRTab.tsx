import { useRef, useState } from 'react'
import { AlertCircle, BarChart3, Eraser, FolderOpen, Loader2, ScanSearch } from 'lucide-react'
import {
  COLORS,
  analyze,
  buildRequest,
  checkPlots,
  cleanSpots,
  emptyPlots,
  withTimes,
  type Analysis,
  type Plot,
} from '@/lib/wspr'

const MANUAL_URL =
  'https://jl1nie.wordpress.com/2022/05/02/%e7%b0%a1%e6%98%93wspr%e8%a7%a3%e6%9e%90%e3%83%84%e3%83%bc%e3%83%ab%e3%81%ae%e8%a3%bd%e4%bd%9c/'

const NO_ANALYSIS: Analysis = { spots: [], times: [] }

/**
 * WSPRnet の検索結果から、SNR と距離のグラフを描く。使い方は、マニュアル(MANUAL_URL)のとおり:
 * WSPRnet の結果を貼り付け → Analyze(時刻の一覧を取り出す) → 系列ごとに、名前・色・開始・終了を選ぶ → Draw
 */
export function WSPRTab() {
  const [title, setTitle] = useState('untitled')
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState<Analysis>(NO_ANALYSIS)
  const [plots, setPlots] = useState<Plot[]>(emptyPlots)
  const [minKm, setMinKm] = useState('0')
  const [maxKm, setMaxKm] = useState('20000')
  const [annotation, setAnnotation] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const update = (i: number, patch: Partial<Plot>) =>
    setPlots((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  /** 貼り付けの内容から、スポットのある時刻を取り出す。表示は、読めた行だけに整える */
  const runAnalyze = (source: string) => {
    const a = analyze(source)
    setAnalysis(a)
    setText(cleanSpots(source))
    setPlots((ps) => withTimes(ps, a))
    setSvgContent(null)
    setError(a.spots.length === 0 ? 'スポットが読み取れませんでした(WSPRnet の検索結果を貼り付けてください)' : null)
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) runAnalyze(await file.text())
  }

  const clear = () => {
    setTitle('untitled')
    setText('')
    setAnalysis(NO_ANALYSIS)
    setPlots(emptyPlots())
    setMinKm('0')
    setMaxKm('20000')
    setAnnotation(false)
    setSvgContent(null)
    setError(null)
  }

  const draw = async () => {
    if (analysis.spots.length === 0) {
      setError('先に Analyze してください(WSPRnet の検索結果を貼り付けます)')
      return
    }
    const problem = checkPlots(plots)
    if (problem) {
      setError(problem)
      return
    }
    setLoading(true)
    setError(null)
    setSvgContent(null)
    try {
      const request = buildRequest(text, plots, {
        title,
        minKm: Number(minKm) || 0,
        maxKm: Number(maxKm) || 20000,
        annotation,
        width: Math.min(Math.max(window.innerWidth, 400), 1000),
      })
      const response = await fetch('/api/v2/wspr/svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ arg: JSON.stringify(request) }),
      })
      if (!response.ok) throw new Error('グラフの作成に失敗しました')
      setSvgContent(await response.text())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const timeOptions = analysis.times.map((t) => (
    <option key={t} value={t}>
      {t}
    </option>
  ))

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">WSPRnet SNR distribution</h2>
          <a href={MANUAL_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm">
            Help
          </a>
        </div>

        <div className="space-y-1">
          <label htmlFor="wspr-title" className="label">
            Title
          </label>
          <input id="wspr-title" value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
        </div>

        {/* 系列(Plots): 名前・色・開始・終了(UTC)。チェックを付けたものを描く */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-2">Plots</th>
                <th className="py-1 pr-2">Color</th>
                <th className="py-1 pr-2">From (UTC)</th>
                <th className="py-1">To (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {plots.map((p, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) => update(i, { enabled: e.target.checked })}
                        aria-label={`Plot ${i + 1} を描く`}
                        className="w-5 h-5"
                      />
                      <input
                        value={p.label}
                        onChange={(e) => update(i, { label: e.target.value })}
                        aria-label={`Plot ${i + 1} の名前`}
                        placeholder="例: 8mワイヤ"
                        className="input"
                      />
                    </div>
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      value={p.color}
                      onChange={(e) => update(i, { color: e.target.value })}
                      aria-label={`Plot ${i + 1} の色`}
                      className="input"
                    >
                      {COLORS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      value={p.from}
                      onChange={(e) => update(i, { from: e.target.value })}
                      aria-label={`Plot ${i + 1} の開始`}
                      className="input"
                    >
                      {timeOptions}
                    </select>
                  </td>
                  <td className="py-1">
                    <select
                      value={p.to}
                      onChange={(e) => update(i, { to: e.target.value })}
                      aria-label={`Plot ${i + 1} の終了`}
                      className="input"
                    >
                      {timeOptions}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="wspr-min" className="label">
              Min. Distance (km)
            </label>
            <input
              id="wspr-min"
              type="number"
              min={0}
              value={minKm}
              onChange={(e) => setMinKm(e.target.value)}
              className="input"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="wspr-max" className="label">
              Max. Distance (km)
            </label>
            <input
              id="wspr-max"
              type="number"
              min={0}
              value={maxKm}
              onChange={(e) => setMaxKm(e.target.value)}
              className="input"
            />
          </div>
          <label className="flex items-center gap-2 pt-6 cursor-pointer">
            <input
              type="checkbox"
              checked={annotation}
              onChange={(e) => setAnnotation(e.target.checked)}
              className="w-5 h-5"
            />
            <span className="font-medium">Annotation(局名を表示)</span>
          </label>
        </div>

        <div className="space-y-1">
          <label htmlFor="wspr-spots" className="label">
            WSPRnet の検索結果
          </label>
          <textarea
            id="wspr-spots"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="WSPRnet のスポット検索の結果(一番下の行まで)をコピーして貼り付け、Analyze を押します。余分な文字が入っていても構いません。"
            spellCheck={false}
            className="input font-mono text-xs leading-tight h-60 resize-y"
          />
          {analysis.spots.length > 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {analysis.spots.length} スポット / {analysis.times.length} 回の送信(UTC)
            </p>
          )}
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            Open
          </button>
          <button type="button" onClick={() => runAnalyze(text)} className="btn-primary flex items-center gap-2">
            <ScanSearch className="w-4 h-4" />
            Analyze
          </button>
          <button type="button" onClick={clear} className="btn-secondary flex items-center gap-2">
            <Eraser className="w-4 h-4" />
            Clear
          </button>
          <button type="button" onClick={draw} disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            Draw
          </button>
        </div>

        {(loading || svgContent) && (
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 flex items-center justify-center min-h-[200px]">
            {loading && <Loader2 className="w-8 h-8 animate-spin text-gray-500" aria-label="作成中" />}
            {!loading && svgContent && (
              <div
                // サーバーの SVG は幅が固定。欄の幅に合わせて縮める
                className="w-full [&_svg]:w-full [&_svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
