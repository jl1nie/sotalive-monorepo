import { useState } from 'react'
import { BarChart3, AlertCircle, Loader2 } from 'lucide-react'
import { FileUpload, TextInput, SubmitButton } from '@/components/Forms'

export function WSPRTab() {
  const [title, setTitle] = useState('untitled')
  const [callsign, setCallsign] = useState('')
  const [band, setBand] = useState('20m')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [svgContent, setSvgContent] = useState<string | null>(null)

  const bands = ['160m', '80m', '60m', '40m', '30m', '20m', '17m', '15m', '12m', '10m', '6m', '2m']

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!file) {
      setError('WSPRnet のスポットファイルを指定してください')
      return
    }
    if (!startDate || !endDate || startDate > endDate) {
      setError('開始日と終了日を正しく指定してください')
      return
    }

    setLoading(true)
    setError(null)
    setSvgContent(null)

    try {
      // サーバーの形式: 期間(plots)ごとに、スポット(WSPRnet の1行13項目)を振り分けて描く。
      // 画面は期間が1つ。凡例は「コールサイン バンド」
      const jsonData = {
        title,
        plots: [
          {
            label: [callsign, band].filter(Boolean).join(' '),
            color: 'blue',
            from: `${startDate} 00:00`,
            to: `${endDate} 23:59`,
          },
        ],
        spots: await file.text(),
        min: 0,
        max: 20000,
        label: true,
        width: 800,
      }

      const response = await fetch('/api/v2/wspr/svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          arg: JSON.stringify(jsonData),
        }),
      })
      
      if (!response.ok) {
        throw new Error('SVG generation failed')
      }
      
      const svg = await response.text()
      setSvgContent(svg)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          WSPRnet SNR Distribution
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Generate SNR distribution chart from WSPRnet data
        </p>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form Column */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <TextInput
              id="wspr-title"
              label="Chart Title"
              value={title}
              onChange={setTitle}
              placeholder="My WSPR Analysis"
            />
            
            <div className="grid grid-cols-2 gap-3">
              <TextInput
                id="wspr-callsign"
                label="Callsign"
                value={callsign}
                onChange={setCallsign}
                placeholder="JA1ABC"
              />
              
              <div className="space-y-1">
                <label htmlFor="wspr-band" className="label">Band</label>
                <select
                  id="wspr-band"
                  value={band}
                  onChange={(e) => setBand(e.target.value)}
                  className="input"
                >
                  {bands.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="wspr-start" className="label">Start Date</label>
                <input
                  id="wspr-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input"
                />
              </div>
              
              <div className="space-y-1">
                <label htmlFor="wspr-end" className="label">End Date</label>
                <input
                  id="wspr-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input"
                />
              </div>
            </div>
            
            <FileUpload
              id="wspr-file"
              label="WSPRnet スポットファイル"
              accept=".csv,.txt"
              value={file}
              onChange={setFile}
            />
            
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
            
            <SubmitButton loading={loading} className="w-full">
              <BarChart3 className="w-4 h-4" />
              Generate Chart
            </SubmitButton>
          </form>
          
          {/* Result Column */}
          <div className="space-y-2">
            <h3 className="label">Result</h3>
            
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 min-h-[300px] flex items-center justify-center">
              {loading && (
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm">Generating chart...</p>
                </div>
              )}
              
              {!loading && svgContent && (
                <div
                  // サーバーの SVG は幅が固定(800px)。欄の幅に合わせて縮める
                  className="w-full [&_svg]:w-full [&_svg]:h-auto"
                  dangerouslySetInnerHTML={{ __html: svgContent }}
                />
              )}
              
              {!loading && !svgContent && (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Enter parameters and click Generate
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
