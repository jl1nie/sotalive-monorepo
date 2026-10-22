import { useState, useRef, useCallback, useMemo } from 'react'
import { Upload, Download, AlertCircle, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { usePrefsStore } from '@/stores/prefsStore'
import { ConvertError, fetchWithTimeout, errorMessage, failureReasons, throwFailure, saveZip } from '@/lib/convert'
import type { MyQTHOption, HisQTHOption } from '@/types/form'
import type { LogConvCheckResponse } from '@/types/api'

// Table column headers
const TABLE_HEADERS = [
  'No.',
  'Call',
  'Date',
  'Time',
  'Band',
  'Mode',
  'Sent',
  'Rcvd',
  'SigInfo',
  'MySigInfo',
  'Station',
  'Operator',
]

// Options for My QTH (運用先)
const myQthOptions: { value: MyQTHOption; label: string }[] = [
  { value: 'form', label: 'リファレンス/公園番号を入力' },
  { value: 'rmks1', label: 'Remarks1で指定する' },
  { value: 'rmks2', label: 'Remarks2で指定する' },
]

// Options for His QTH (相手局)
const hisQthOptions: { value: HisQTHOption; label: string }[] = [
  { value: 'none', label: '指定しない' },
  { value: 'rmks1', label: 'Remarks1で指定する' },
  { value: 'rmks2', label: 'Remarks2で指定する' },
  { value: 'qth', label: 'QTHで指定する' },
]

// Reference validation regex
const SOTA_REF = /^\w+\/\w+-\d{3}$/
// 公園の番号は4桁か5桁(US-10995 など)
const PARK_REF = /^\w+-\d{4,5}$/

function validateRefs(refString: string): boolean {
  if (!refString.trim()) return false
  const refs = refString.trim().toUpperCase().split(/[,\s]+/)
  return refs.every((ref) => SOTA_REF.test(ref) || PARK_REF.test(ref))
}

export function POTAActivatorTab() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<string[][]>([])
  const [loading, setLoading] = useState(false)
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 確認の結果。入力(ファイル・指定)が変わったら、古い結果は使わない(key で見分ける)
  const [check, setCheck] = useState<{ key: string; errors: string[] } | null>(null)

  const {
    potaActivationCall,
    potaOperator,
    potaPark,
    myQTHPota,
    actQTHPota,
    setPotaActivationCall,
    setPotaOperator,
    setPotaPark,
    setMyQTHPota,
    setActQTHPota,
  } = usePrefsStore()

  const checkKey = useMemo(
    () =>
      JSON.stringify([
        file && [file.name, file.size, file.lastModified],
        potaActivationCall,
        potaOperator,
        potaPark,
        myQTHPota,
        actQTHPota,
      ]),
    [file, potaActivationCall, potaOperator, potaPark, myQTHPota, actQTHPota]
  )
  const checked = check?.key === checkKey ? check : null
  // 確認でエラーが出たログは、ADIF を生成できない
  const hasErrors = (checked?.errors.length ?? 0) > 0

  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setCsvData([])
      setCheck(null)
      setError(null)
    }
  }, [])

  // Validate form before actions
  const validateForm = useCallback((): string | null => {
    if (!potaActivationCall.trim()) {
      return '運用時のコールサインを入力してください'
    }
    if (myQTHPota === 'form') {
      if (!potaPark.trim()) {
        return '運用先を入力してください'
      }
      if (!validateRefs(potaPark)) {
        return '運用先リファレンスに誤りがあります（例: JAFF-0005 JP-0014 JA/TK-001）'
      }
    }
    if (myQTHPota === 'rmks1' && actQTHPota === 'rmks1') {
      return 'Remarks1の指定が重複しています'
    }
    if (myQTHPota === 'rmks2' && actQTHPota === 'rmks2') {
      return 'Remarks2の指定が重複しています'
    }
    return null
  }, [potaActivationCall, potaPark, myQTHPota, actQTHPota])

  // CSV を確認する(サーバー)。エラーの一覧を返す。通信に失敗したら例外
  const runCheck = useCallback(
    async (target: File): Promise<string[]> => {
      const formData = new FormData()
      formData.append('file', target)
      formData.append(
        'options',
        JSON.stringify({
          format: 'pota',
          command: 'ADIFCSVCheck',
          myQTH: myQTHPota,
          QTH: actQTHPota,
          Park: potaPark,
          POTAActivator: potaActivationCall.trim(),
          POTAOperator: potaOperator,
        })
      )

      const response = await fetchWithTimeout('/api/v2/logconv/pota', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        await throwFailure(response, 'CSVファイルの解析に失敗しました', false)
      }

      const data: LogConvCheckResponse = await response.json()
      const errors = data.status === 'NG' ? (data.error_log?.length ? data.error_log : [data.error || '不明なエラー']) : []
      setCsvData(data.log_text ?? [])
      setCheck({ key: checkKey, errors })
      return errors
    },
    [checkKey, potaActivationCall, potaOperator, potaPark, myQTHPota, actQTHPota]
  )

  const errorsMessage = (errors: string[]) =>
    `CSVファイルにエラーがあります。直すまで、ADIFは生成できません: ${errors.join(' / ')}`

  // Read CSV and check format
  const handleReadCSV = useCallback(async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    if (!file) {
      setError('HAMLOG CSVファイルを指定してください')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const errors = await runCheck(file)
      if (errors.length > 0) setError(errorsMessage(errors))
    } catch (err) {
      setError(errorMessage(err))
      setCheck(null)
    } finally {
      setLoading(false)
    }
  }, [file, validateForm, runCheck])

  // Generate ADIF and download
  const handleGenerateADIF = useCallback(async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    if (!file) {
      setError('HAMLOG CSVファイルを指定してください')
      return
    }

    setConverting(true)
    setError(null)

    try {
      // まだ確認していないログは、先に確認する。エラーがあれば、ADIF は生成しない
      const errors = checked ? checked.errors : await runCheck(file)
      if (errors.length > 0) {
        setError(errorsMessage(errors))
        return
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append(
        'options',
        JSON.stringify({
          format: 'pota',
          myQTH: myQTHPota,
          QTH: actQTHPota,
          Park: potaPark,
          POTAActivator: potaActivationCall.trim(),
          POTAOperator: potaOperator,
        })
      )

      const response = await fetchWithTimeout('/api/v2/logconv/hamlog', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        // サーバーも、エラーのあるログは受け付けない(error_log で理由を返す)
        const reasons = response.status === 413 ? [] : await failureReasons(response, false)
        if (reasons.length) throw new ConvertError(errorsMessage(reasons))
        await throwFailure(response, 'ADIF生成に失敗しました', false)
      }

      await saveZip(response, `${potaActivationCall.trim().replace(/\//g, '-')}_adif.zip`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setConverting(false)
    }
  }, [file, potaActivationCall, potaOperator, potaPark, myQTHPota, actQTHPota, checked, runCheck, validateForm])

  return (
    <div className="space-y-4">
      {/* Main container with two columns on larger screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column - Form inputs */}
        <div className="space-y-4">
          {/* Callsign inputs */}
          <div className="card p-4 space-y-3">
            <div>
              <label htmlFor="pota-callsign" className="block text-sm font-medium mb-1">
                運用時のコールサイン <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="pota-callsign"
                value={potaActivationCall}
                onChange={(e) => setPotaActivationCall(e.target.value.toUpperCase())}
                placeholder="例: JL1NIE/1"
                className="input w-full"
                required
              />
            </div>

            <div>
              <label htmlFor="pota-operator" className="block text-sm font-medium mb-1">
                運用時のオペレータ（任意）
              </label>
              <input
                type="text"
                id="pota-operator"
                value={potaOperator}
                onChange={(e) => setPotaOperator(e.target.value.toUpperCase())}
                placeholder="例: JL1NIE"
                className="input w-full"
              />
            </div>
          </div>

          {/* My QTH (運用先) */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-2">SOTA/JAFF/POTA運用先</h3>
            <div className="space-y-2">
              {myQthOptions.map((option) => (
                <label key={option.value} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="myQTH"
                    value={option.value}
                    checked={myQTHPota === option.value}
                    onChange={(e) => setMyQTHPota(e.target.value as MyQTHOption)}
                    className="mt-1"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
              {myQTHPota === 'form' && (
                <input
                  type="text"
                  value={potaPark}
                  onChange={(e) => setPotaPark(e.target.value.toUpperCase())}
                  placeholder="例: JAFF-0005 JP-0014"
                  className="input w-full mt-2"
                />
              )}
            </div>
          </div>

          {/* His QTH (相手局) */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-2">相手局のリファレンス/公園番号</h3>
            <div className="space-y-2">
              {hisQthOptions.map((option) => (
                <label key={option.value} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="hisQTH"
                    value={option.value}
                    checked={actQTHPota === option.value}
                    onChange={(e) => setActQTHPota(e.target.value as HisQTHOption)}
                    className="mt-1"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Right column - CSV preview table */}
        <div className="lg:col-span-2">
          <div className="card h-full flex flex-col">
            <div className="flex-none p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-sm font-medium">
              CSV プレビュー
            </div>
            {/* 2列のときは、左の列と同じ高さまで使う(スクロールの領域は絶対配置にして、行の高さを押し広げない)。1列のときは固定の高さ */}
            <div className="relative min-h-0 flex-none h-[max(300px,calc(60vh-2rem))] lg:flex-1 lg:h-auto lg:min-h-[max(300px,calc(60vh-2rem))]">
              <div className="absolute inset-0 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
                    <tr>
                      {TABLE_HEADERS.map((header) => (
                        <th
                          key={header}
                          className="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {csvData.length === 0 ? (
                      <tr>
                        <td colSpan={TABLE_HEADERS.length} className="px-4 py-8 text-center text-gray-500">
                          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          CSVファイルを読み込んでプレビュー
                        </td>
                      </tr>
                    ) : (
                      csvData.map((row, idx) => {
                        const hasError = row.length > 11
                        return (
                          <tr
                            key={idx}
                            className={hasError ? 'bg-red-50 dark:bg-red-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}
                          >
                            <td className={`px-2 py-1 whitespace-nowrap ${hasError ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                              {hasError ? (
                                <span title={row[11]}>{idx + 1}</span>
                              ) : (
                                idx + 1
                              )}
                            </td>
                            {row.slice(0, 11).map((cell, cellIdx) => (
                              <td key={cellIdx} className="px-2 py-1 whitespace-nowrap">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* File upload and action buttons */}
      <div className="card p-4 space-y-4">
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

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReadCSV}
            disabled={!file || loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            CSV読込
          </button>

          <button
            type="button"
            onClick={handleGenerateADIF}
            disabled={!file || converting || hasErrors}
            title={hasErrors ? 'CSVのエラーを直すまで、ADIFは生成できません' : undefined}
            className="btn-primary flex items-center gap-2"
          >
            {converting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            ADIF生成
          </button>

          <a
            href="https://www.sotadata.org.uk/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            SOTAログアップロード
          </a>

          <a
            href="mailto:jaff-log@nifty.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            JAFFログ送付
          </a>

          <a
            href="https://pota.app/#/user/logs"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            POTAログアップロード
          </a>

          <a
            href="https://bit.ly/35Wfj4J"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-info flex items-center gap-2"
          >
            使い方
          </a>
        </div>
      </div>
    </div>
  )
}
