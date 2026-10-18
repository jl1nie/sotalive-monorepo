import { useState } from 'react'
import { Camera, Copy } from 'lucide-react'
import { JoinSheet } from '@/components/JoinSheet'
import { QrCode } from '@/components/QrCode'
import { QrScanSheet } from '@/components/QrScanSheet'
import type { useSync } from '@/hooks/useSync'
import { codeFromText, formatCode, syncUrl } from '@/lib/sync'
import { useT } from '@/lib/i18n'

type Sync = ReturnType<typeof useSync>

/** 設定の中の「設定・予定の同期」。コードを作る・QR とコードを見せる・参加する・やめる */
export function SyncSection({ sync }: { sync: Sync }) {
  const t = useT()
  const [joinText, setJoinText] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [copied, setCopied] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [alsoRemote, setAlsoRemote] = useState(false)

  const startJoin = (text: string) => {
    const code = codeFromText(text)
    if (!code) {
      setProblem(t('scan.notSync'))
      return false
    }
    setProblem(null)
    setPending(code)
    return true
  }

  const statusText = () => {
    if (sync.status === 'syncing') return t('sync.statusSyncing')
    if (sync.status === 'offline') return t('sync.statusOffline')
    if (sync.status === 'unavailable') return t('sync.statusUnavailable')
    if (sync.status === 'error') return t('sync.statusError')
    return sync.lastAt ? t('sync.statusIdle', { time: new Date(sync.lastAt).toLocaleTimeString() }) : ''
  }

  const copy = async () => {
    if (!sync.code) return
    try {
      await navigator.clipboard.writeText(sync.code)
      setCopied(true)
    } catch {
      // コピーできなければ、画面の文字を、手で写してもらう
    }
  }

  return (
    <section aria-labelledby="sync-title" className="space-y-3">
      <h3 id="sync-title" className="label">
        {t('sync.title')}
      </h3>
      <p className="text-sm text-gray-700 dark:text-gray-300">{t('sync.intro')}</p>

      {sync.code ? (
        <>
          <QrCode text={syncUrl(sync.code)} label={t('sync.code')} />
          <p className="text-sm text-gray-700 dark:text-gray-300">{t('sync.qrHint')}</p>
          <div className="flex items-center gap-2">
            <code aria-label={t('sync.code')} className="flex-1 font-mono text-sm break-all select-all">
              {formatCode(sync.code)}
            </code>
            <button type="button" onClick={copy} className="btn-secondary !px-3 shrink-0">
              <Copy className="w-4 h-4" />
              {copied ? t('sync.copied') : t('sync.copy')}
            </button>
          </div>
          <p role="status" className="text-sm font-semibold">
            {statusText()}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void sync.syncNow()} className="btn-secondary">
              {t('sync.now')}
            </button>
            <button type="button" onClick={() => void sync.leave(alsoRemote)} className="btn-secondary">
              {t('sync.leave')}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={alsoRemote} onChange={(e) => setAlsoRemote(e.target.checked)} className="w-5 h-5" />
            {t('sync.leaveRemote')}
          </label>
        </>
      ) : (
        <button
          type="button"
          onClick={() =>
            sync.create().catch(() => {
              setProblem(t('sync.statusError'))
            })
          }
          className="btn-primary w-full"
        >
          {t('sync.start')}
        </button>
      )}

      <div className="space-y-2">
        <label htmlFor="sync-join" className="label">
          {sync.code ? t('sync.joinOther') : t('sync.codeInput')}
        </label>
        <div className="flex gap-2">
          <input
            id="sync-join"
            value={joinText}
            onChange={(e) => setJoinText(e.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="ABCD EFGH …"
            className="input font-mono"
          />
          <button type="button" onClick={() => startJoin(joinText)} disabled={!joinText.trim()} className="btn-secondary shrink-0">
            {t('sync.joinGo')}
          </button>
        </div>
        <button type="button" onClick={() => setScanning(true)} className="btn-secondary w-full flex items-center justify-center gap-2">
          <Camera className="w-5 h-5" />
          {t('sync.scan')}
        </button>
        <p className="text-sm text-gray-700 dark:text-gray-300">{t('sync.iosNote')}</p>
      </div>

      {problem && (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {problem}
        </p>
      )}

      <QrScanSheet
        open={scanning}
        onClose={() => setScanning(false)}
        onScan={(text) => {
          setScanning(false)
          startJoin(text)
        }}
      />
      <JoinSheet code={pending} onJoin={sync.joinWith} onClose={() => setPending(null)} />
    </section>
  )
}
