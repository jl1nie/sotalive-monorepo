import { useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { SyncError } from '@/lib/sync'
import { useT } from '@/lib/i18n'

interface Props {
  /** 参加する同期コード(なければ、閉じている) */
  code: string | null
  onJoin: (code: string) => Promise<void>
  onClose: () => void
}

/** 同期に参加する前の確認。QR・URL・入力で、同期コードが分かったとき。端末の設定が置き換わるので、確かめてから参加する */
export function JoinSheet(props: Props) {
  return props.code ? <Confirm {...props} code={props.code} /> : null
}

function Confirm({ code, onJoin, onClose }: Props & { code: string }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const join = async () => {
    setBusy(true)
    setError(null)
    try {
      await onJoin(code)
      onClose()
    } catch (e) {
      const reason = e instanceof SyncError ? e.kind : 'invalid'
      setError(t('sync.joinFail', { reason: t(`sync.reason.${reason}`) }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('sync.joinTitle')}
      actions={
        <button type="button" onClick={join} disabled={busy} className="btn-success w-full">
          {t('sync.joinOk')}
        </button>
      }
    >
      <p className="mb-3">{t('sync.joinBody')}</p>
      {error && (
        <p role="alert" className="font-semibold text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </Sheet>
  )
}
