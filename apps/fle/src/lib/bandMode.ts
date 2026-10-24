/** 新しいログの、予定の周波数(またはバンド)とモード */
export interface BandMode {
  /** 周波数(MHz)かバンド(`7.032`、`40m`) */
  freq: string
  mode: string
}

/** ログに書く行(`7.032 cw`)。両方空なら空 */
export const bandModeLine = ({ freq, mode }: BandMode): string => [freq.trim(), mode.trim()].filter(Boolean).join(' ')
