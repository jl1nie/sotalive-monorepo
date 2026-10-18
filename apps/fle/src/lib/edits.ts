/** コアが返す、テキストの修正。位置はUTF-16(JSの文字列の添字)で、渡したテキストに対するもの。 */
export interface Edit {
  from: number
  to: number
  insert: string
}

/** 修正を、後ろの位置のものから順に適用する(前の位置がずれないように)。 */
export function applyEdits(text: string, edits: Edit[]): string {
  return [...edits]
    .sort((a, b) => b.from - a.from)
    .reduce((t, e) => t.slice(0, e.from) + e.insert + t.slice(e.to), text)
}

/** 修正を適用した後の、カーソルの位置。カーソルより前(同じ位置を含む)への挿入の分だけ進む。 */
export function mapCaret(caret: number, edits: Edit[]): number {
  return edits.reduce((pos, e) => {
    if (e.to <= caret) return pos + e.insert.length - (e.to - e.from)
    return pos
  }, caret)
}
