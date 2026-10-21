import { useEffect, useState } from 'react'
import { zoneLabel, type LineInfo } from '@/lib/fle'
import { useT } from '@/lib/i18n'

interface Props {
  /** カーソルの行までを読んだ時点の状態(自局のコールサインと運用先) */
  info: LineInfo | null
  /** 時計の時間帯(UTC からの時間差)。緑のバーの時計と同じ */
  tz: number
  /** カーソルの位置で有効なメモ(行の先頭が `#` の行。JCC・JCG など) */
  memo?: string
}

/** 時刻(`HH:MM:SS`)。`tz` は UTC からの時間差 */
function clockAt(now: number, tz: number): string {
  return new Date(now + tz * 3_600_000).toISOString().slice(11, 19)
}

/**
 * フルキーで、ログ欄の上に出す時刻と運用先(CQ を出しながら読む)。
 * 運用先は、カーソルの行で有効なもの(途中で運用先を変えたログでも、その位置の値)
 */
export function StationClock({ info, tz, memo = '' }: Props) {
  const t = useT()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const places = [info?.sota, info?.wwff, ...(info?.pota ?? [])].filter(Boolean)
  return (
    <div
      role="group"
      aria-label={t('clock.label')}
      // 高さは決まった値(CLOCK_REM。入るかどうかを、この高さで決める)
      className="flex-none h-[6.5rem] overflow-hidden flex flex-col items-center justify-center gap-1 select-none"
    >
      <div className="flex items-baseline gap-3 font-mono font-bold tabular-nums">
        <span className="text-4xl leading-none">{clockAt(now, tz)}</span>
        <span className="text-base">{tz === 0 ? 'UTC' : zoneLabel(tz)}</span>
        {/* ログの時間帯が UTC でなければ、UTC も小さく(SOTA・POTA のスポットは UTC) */}
        {tz !== 0 && <span className="text-base text-gray-500 dark:text-gray-400">UTC {clockAt(now, 0).slice(0, 5)}</span>}
      </div>
      {(info?.mycall || places.length > 0) && (
        // 運用先が多ければ(山と公園の n-fer)、折り返して2行まで
        <div className="max-w-full flex flex-wrap justify-center gap-x-3 font-mono text-xl font-bold leading-snug">
          {[info?.mycall, ...places].filter(Boolean).map((code) => (
            <span key={code}>{code}</span>
          ))}
        </div>
      )}
      {/* メモは1行。長ければ末尾を省く */}
      {memo && <div className="max-w-full px-3 truncate text-base font-bold">{memo}</div>}
    </div>
  )
}
