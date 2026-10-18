import type { Edit } from '@/lib/edits'
import type { Plan } from '@/lib/plans'

/** 予定のうち、自局・運用場所(コアが書く)以外で、ログに書くもの */
export interface PlanExtras {
  /** 予定の名前(画面の案内用) */
  name: string
  date: string
  rig: string
  qslmsg: string
}

export const extrasOf = (p: Plan): PlanExtras => ({ name: p.title.trim() || p.id, date: p.date, rig: p.rig, qslmsg: p.qslmsg })

const normalize = (line: string) => line.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * 予定の日付・リグ・QSLメッセージを、ログの指令の行にする。ログにすでに同じ行があれば、書かない。
 * 順は、date → rig → qslmsg(`$rig` を使うメッセージが、rig のあとになるように)。
 */
export function extraLines(extras: PlanExtras, text: string): string[] {
  const have = new Set(text.split('\n').map(normalize))
  return [
    extras.date && `date ${extras.date}`,
    extras.rig.trim() && `rig ${extras.rig.trim().replace(/%/g, '')}`,
    extras.qslmsg.trim() && `qslmsg ${extras.qslmsg.trim()}`,
  ]
    .filter((l): l is string => Boolean(l))
    .filter((l) => !have.has(normalize(l)))
}

/** `line`(0始まり)の行頭の位置。行がテキストの終わりを超えるなら、末尾 */
function lineOffset(text: string, line: number): number {
  const lines = text.split('\n')
  if (line >= lines.length) return text.length
  return lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0)
}

/**
 * コアが返した、自局・運用場所の修正の、すぐあとに、`lines` を足す。
 * 自局・運用場所に変更がなければ(修正がなければ)、同じ位置(`line` の行頭。末尾なら、末尾)に足す。
 */
export function withExtras(text: string, line: number, edits: Edit[], lines: string[]): Edit[] {
  if (lines.length === 0) return edits
  const block = lines.join('\n') + '\n'
  const last = edits[edits.length - 1]
  if (last && last.from === last.to && last.insert.endsWith('\n')) {
    return [...edits.slice(0, -1), { ...last, insert: last.insert + block }]
  }
  const at = lineOffset(text, line)
  const lead = at === text.length && text !== '' && !text.endsWith('\n') ? '\n' : ''
  return [...edits, { from: at, to: at, insert: lead + block }]
}
