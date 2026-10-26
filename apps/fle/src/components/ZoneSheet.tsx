import { Sheet } from '@/components/Sheet'
import { useT } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  /** 設定の時間帯の短い名前(JST、UTC+8) */
  zone: string
  onLocal: () => void
  onUtc: () => void
}

/**
 * 時間帯(`timezone`)の行のないログを読み込んだとき、時刻をどちらで書いたかを一度だけ聞く。答えると先頭に行を足す。
 * 閉じれば、何も足さない(UTC として読む)。
 */
export function ZoneSheet({ open, onClose, zone, onLocal, onUtc }: Props) {
  const t = useT()
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('zoneAsk.title')}
      closeLabel={t('retime.cancel')}
      actions={
        <>
          <button type="button" onClick={onLocal} className="btn-success w-full">
            {t('zoneAsk.local', { zone })}
          </button>
          <button type="button" onClick={onUtc} className="btn-secondary w-full">
            {t('zoneAsk.utc')}
          </button>
        </>
      }
    >
      <p className="mb-3">{t('zoneAsk.question')}</p>
      <p className="text-sm">{t('zoneAsk.hint')}</p>
    </Sheet>
  )
}
