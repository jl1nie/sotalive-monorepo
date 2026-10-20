import { useState, useRef, useCallback } from 'react'
import { Upload, Download, AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
import { usePrefsStore } from '@/stores/prefsStore'
import { fetchWithTimeout, errorMessage, throwFailure, saveZip } from '@/lib/convert'
import type { HisQTHOption } from '@/types/form'

// Options for His QTH (相手局のSOTA山岳ID)
const hisQthOptions: { value: HisQTHOption; label: string }[] = [
  { value: 'rmks1', label: 'Remarks1で指定する' },
  { value: 'rmks2', label: 'Remarks2で指定する' },
  { value: 'qth', label: 'QTHで指定する' },
]

export function SOTAChaserTab() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { chaserCall, hisQTHChaser, setChaserCall, setHisQTHChaser } = usePrefsStore()

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
    }
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!chaserCall.trim()) {
      setError('運用時のコールサインを入力してください')
      return
    }
    if (!file) {
      setError('HamLog CSVファイルを指定してください')
      return
    }

    setLoading(true)
    setError(null)
    const call = chaserCall.trim()

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append(
        'options',
        JSON.stringify({
          format: 'sota_c',
          QTH: hisQTHChaser,
          callsign: call,
        })
      )

      const response = await fetchWithTimeout('/api/v2/logconv/hamlog', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        await throwFailure(response, '変換に失敗しました')
      }

      await saveZip(response, `${call.replace(/\//g, '-')}_sota_chaser.zip`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [file, chaserCall, hisQTHChaser])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card p-6 space-y-6">
        <h2 className="text-lg font-semibold">SOTA Chaser CSV Generator</h2>

        {/* Callsign */}
        <div>
          <label htmlFor="sota-chaser-callsign" className="block text-sm font-medium mb-1">
            運用時のコールサイン <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="sota-chaser-callsign"
            value={chaserCall}
            onChange={(e) => setChaserCall(e.target.value.toUpperCase())}
            placeholder="例: JL1NIE"
            className="input w-full"
            required
          />
        </div>

        {/* His QTH (Summit) */}
        <div>
          <h3 className="text-sm font-semibold mb-2">相手局のSOTA山岳ID</h3>
          <div className="space-y-2">
            {hisQthOptions.map((option) => (
              <label key={option.value} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="hisQTH"
                  value={option.value}
                  checked={hisQTHChaser === option.value}
                  onChange={(e) => setHisQTHChaser(e.target.value as HisQTHOption)}
                  className="mt-1"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* File input */}
        <div>
          <label className="block text-sm font-medium mb-2">HamLog CSVファイルを選択</label>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              ファイル選択
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-xs">
              {file ? file.name : '未選択'}
            </span>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!file || loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            変換
          </button>
          <a
            href="https://www.sotadata.org.uk/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            sotadata.org.uk
          </a>
        </div>
      </div>
    </div>
  )
}
