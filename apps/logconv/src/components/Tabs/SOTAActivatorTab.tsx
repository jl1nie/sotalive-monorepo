import { useState, useRef, useCallback } from 'react'
import { Upload, Download, AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
import { usePrefsStore } from '@/stores/prefsStore'
import type { MyQTHOption, HisQTHOption } from '@/types/form'

// Options for My QTH (運用したSOTA山岳ID)
const myQthOptions: { value: MyQTHOption; label: string }[] = [
  { value: 'form', label: '山岳IDを入力' },
  { value: 'rmks1', label: 'Remarks1で指定する' },
  { value: 'rmks2', label: 'Remarks2で指定する' },
]

// Options for His QTH (S2S交信局)
const hisQthOptions: { value: HisQTHOption; label: string }[] = [
  { value: 'none', label: '指定しない' },
  { value: 'rmks1', label: 'Remarks1で指定する' },
  { value: 'rmks2', label: 'Remarks2で指定する' },
]

// SOTA reference validation
const SOTA_REF = /^\w+\/\w+-\d{3}$/

export function SOTAActivatorTab() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    sotaActivationCall,
    sotaSummit,
    myQTHSota,
    actQTHSota,
    setSotaActivationCall,
    setSotaSummit,
    setMyQTHSota,
    setActQTHSota,
  } = usePrefsStore()

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
    }
  }, [])

  const validateForm = useCallback((): string | null => {
    if (!sotaActivationCall.trim()) {
      return '運用時のコールサインを入力してください'
    }
    if (myQTHSota === 'form') {
      if (!sotaSummit.trim()) {
        return '運用した山岳IDを入力してください'
      }
      if (!SOTA_REF.test(sotaSummit.toUpperCase())) {
        return '山岳IDの形式が正しくありません（例: JA/KN-006）'
      }
    }
    if (myQTHSota === 'rmks1' && actQTHSota === 'rmks1') {
      return 'Remarks1の指定が重複しています'
    }
    if (myQTHSota === 'rmks2' && actQTHSota === 'rmks2') {
      return 'Remarks2の指定が重複しています'
    }
    return null
  }, [sotaActivationCall, sotaSummit, myQTHSota, actQTHSota])

  const handleSubmit = useCallback(async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    if (!file) {
      setError('HamLog CSVファイルを指定してください')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append(
        'options',
        JSON.stringify({
          format: 'sota_a',
          myQTH: myQTHSota,
          QTH: actQTHSota,
          Summit: sotaSummit,
          SOTAActivator: sotaActivationCall,
        })
      )

      const response = await fetch('/api/v2/logconv/hamlog', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('変換に失敗しました')
      }

      // Download ZIP file
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${sotaActivationCall.replace(/\//g, '-')}_sota_activator.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [file, sotaActivationCall, sotaSummit, myQTHSota, actQTHSota, validateForm])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card p-6 space-y-6">
        <h2 className="text-lg font-semibold">SOTA Activator CSV Generator</h2>

        {/* Callsign */}
        <div>
          <label htmlFor="sota-act-callsign" className="block text-sm font-medium mb-1">
            運用時のコールサイン <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="sota-act-callsign"
            value={sotaActivationCall}
            onChange={(e) => setSotaActivationCall(e.target.value.toUpperCase())}
            placeholder="例: JL1NIE/1"
            className="input w-full"
            required
          />
        </div>

        {/* My QTH (Summit) */}
        <div>
          <h3 className="text-sm font-semibold mb-2">運用したSOTA山岳ID</h3>
          <div className="space-y-2">
            {myQthOptions.map((option) => (
              <label key={option.value} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="myQTH"
                  value={option.value}
                  checked={myQTHSota === option.value}
                  onChange={(e) => setMyQTHSota(e.target.value as MyQTHOption)}
                  className="mt-1"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
            {myQTHSota === 'form' && (
              <input
                type="text"
                value={sotaSummit}
                onChange={(e) => setSotaSummit(e.target.value.toUpperCase())}
                placeholder="例: JA/KN-006"
                className="input w-full mt-2"
              />
            )}
          </div>
        </div>

        {/* His QTH (S2S) */}
        <div>
          <h3 className="text-sm font-semibold mb-2">S2S交信局のSOTA山岳ID</h3>
          <div className="space-y-2">
            {hisQthOptions.map((option) => (
              <label key={option.value} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="hisQTH"
                  value={option.value}
                  checked={actQTHSota === option.value}
                  onChange={(e) => setActQTHSota(e.target.value as HisQTHOption)}
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
