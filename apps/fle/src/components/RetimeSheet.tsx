import { Sheet } from '@/components/Sheet'
import { useT } from '@/lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  /** 新しい時間帯の短い名前(JST、UTC+8、UTC) */
  zone: string
  /** 最初の QSO の、いまの時刻と、変換した時刻(HH:MM) */
  from: string
  to: string
  qsos: number
  onConvert: () => void
  onKeep: () => void
}

/** QSO のあるログで時間帯を変えるとき、時刻を変換するか、そのままにするかを確かめる。閉じれば、変えない。 */
export function RetimeSheet({ open, onClose, zone, from, to, qsos, onConvert, onKeep }: Props) {
  const t = useT()
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('retime.title', { zone })}
      actions={
        <>
          <button type="button" onClick={onConvert} className="btn-success w-full">
            {t('retime.convert')}
          </button>
          <button type="button" onClick={onKeep} className="btn-secondary w-full">
            {t('retime.keep')}
          </button>
        </>
      }
    >
      <p className="font-mono text-lg font-bold mb-3">{t('retime.example', { from, to, qsos })}</p>
      <p className="text-sm mb-1">
        <b>{t('retime.convert')}</b>: {t('retime.convert.hint', { zone })}
      </p>
      <p className="text-sm">
        <b>{t('retime.keep')}</b>: {t('retime.keep.hint', { zone })}
      </p>
    </Sheet>
  )
}
