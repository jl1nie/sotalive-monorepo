/** RST の末尾へキャレットを移したときの、テキストとキャレット */
export interface RstMark {
  part: 'rstRcvd' | 'rstSent'
  text: string
  caret: number
}

/**
 * 緑のバーの RST を押したとき、受信と送信のどちらの末尾へ移すか。
 * 直前に受信へ移して、そのあとテキストもキャレットも動いていなければ送信。それ以外は、いつも受信
 * (言い直してくるのは、主に相手からもらった方)。
 */
export function nextRst(last: RstMark | null, text: string, caret: number): RstMark['part'] {
  return last?.part === 'rstRcvd' && last.text === text && last.caret === caret ? 'rstSent' : 'rstRcvd'
}
