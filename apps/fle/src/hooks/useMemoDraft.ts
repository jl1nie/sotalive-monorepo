import { useRef, useState } from 'react'
import { lookupMemo } from '@/lib/memo'

/**
 * 場所のシートと予定のメモ(JCC・JCG など)。山・公園を選ぶか、現在地を取ると、JCC・JCG を引いて入れる
 * (書き込む前に見て、直せる)。手で書いたあとに届いた結果では、上書きしない
 */
export function useMemoDraft(initial: string) {
  const [memo, setMemo] = useState(initial)
  const [touched, setTouched] = useState(false)
  const [looking, setLooking] = useState(false)
  // 最後の問い合わせの番号(古い問い合わせの結果を捨てる)
  const seq = useRef(0)

  /**
   * 山・公園・現在地の緯度・経度から引く。引けなければ(日本の外・オフライン)、そのまま。
   * `typed`(候補を押さずに番号を打ったとき)なら、手で書いたメモは上書きしない
   */
  const lookup = async (pos: { lat: number; lon: number }, typed = false) => {
    if (typed && touched) return
    const n = ++seq.current
    setLooking(true)
    const found = await lookupMemo(pos.lat, pos.lon)
    if (n !== seq.current) return
    setLooking(false)
    if (found) setMemo(found)
  }

  /** 手で書く(引いている途中の結果は捨てる) */
  const edit = (value: string) => {
    seq.current++
    setLooking(false)
    setTouched(true)
    setMemo(value)
  }

  /** 予定を選んだとき。予定にメモがあれば、それにする */
  const fromPlan = (value: string) => {
    if (!value) return
    seq.current++
    setLooking(false)
    setMemo(value)
  }

  /** 書き込む値。手で触っておらず空なら null(書き込むときに、山・公園から引く) */
  const value = (): string | null => (touched || memo.trim() ? memo.trim() : null)

  return { memo, looking, lookup, edit, fromPlan, value }
}
