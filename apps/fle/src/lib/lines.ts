/** 文字位置が何行目か(0始まり)。Rust側の行番号(`\n`区切り)と同じ数え方。 */
export function lineOf(text: string, pos: number): number {
  let n = 0
  const end = Math.min(pos, text.length)
  for (let i = 0; i < end; i++) if (text.charCodeAt(i) === 10) n++
  return n
}

/** 指定行の [開始, 終了) の文字位置。行が無ければ末尾。 */
export function lineRange(text: string, line: number): [number, number] {
  let start = 0
  for (let i = 0; i < line; i++) {
    const nl = text.indexOf('\n', start)
    if (nl < 0) return [text.length, text.length]
    start = nl + 1
  }
  const end = text.indexOf('\n', start)
  return [start, end < 0 ? text.length : end]
}

/** カーソル直前の語を候補で置き換え、続けて打てるよう後ろに空白を入れる。 */
export function replaceToken(
  text: string,
  caret: number,
  insert: string
): { text: string; caret: number } {
  const token = /\S*$/.exec(text.slice(0, caret))?.[0] ?? ''
  const start = caret - token.length
  // すでに空白が続いているときは重ねず、その空白の後ろへカーソルを進める
  const gap = text[caret] === ' ' ? '' : ' '
  return {
    text: text.slice(0, start) + insert + gap + text.slice(caret),
    caret: start + insert.length + 1,
  }
}
