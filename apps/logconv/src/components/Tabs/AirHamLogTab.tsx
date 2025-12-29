import { useState } from 'react'
import { Download, AlertCircle } from 'lucide-react'
import { FileUpload, SubmitButton } from '@/components/Forms'

export function AirHamLogTab() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a file')
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      formData.append('logfile', file)
      formData.append('mode', 'airhamlog')
      
      const response = await fetch('/api/v2/logconv/hamlog', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error('Conversion failed')
      }
      
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name.replace(/\.[^.]+$/, '') + '.adi'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          AirHamLog Converter
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Convert AirHamLog CSV exports to ADIF format
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <FileUpload
            id="airham-file"
            label="AirHamLog Export File"
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
          
          <SubmitButton loading={loading} disabled={!file} className="w-full">
            <Download className="w-4 h-4" />
            Convert to ADIF
          </SubmitButton>
        </form>
      </div>
    </div>
  )
}
