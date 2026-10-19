/** 写し取る、文字の並びを決めるスタイル */
const PROPS = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'tabSize',
  'textTransform',
  'wordSpacing',
] as const

/**
 * テキスト欄の中での、`pos` の文字の上端の位置(px、内容の先頭から)。
 * 同じスタイルの見えない写しで測るので、折り返した行も数える。
 */
export function caretTop(ta: HTMLTextAreaElement, pos: number): number {
  const style = getComputedStyle(ta)
  const mirror = document.createElement('div')
  for (const p of PROPS) mirror.style[p] = style[p]
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  mirror.textContent = ta.value.slice(0, pos)
  const mark = document.createElement('span')
  mark.textContent = ta.value.slice(pos, pos + 1) || '.'
  mirror.appendChild(mark)
  document.body.appendChild(mirror)
  const top = mark.offsetTop - parseFloat(style.paddingTop) - parseFloat(style.borderTopWidth)
  mirror.remove()
  return top
}

/**
 * キャレットが見えていなければ、見えるところ(上から 1/3)までスクロールする。見えていれば動かさない。
 * 下端の余白(重なる補完候補の分)は、見えないところとして扱う。
 */
export function scrollCaretIntoView(ta: HTMLTextAreaElement, pos: number) {
  const style = getComputedStyle(ta)
  const lineHeight = parseFloat(style.lineHeight) || 26
  const top = caretTop(ta, pos) + parseFloat(style.paddingTop)
  const visibleBottom = ta.scrollTop + ta.clientHeight - parseFloat(style.paddingBottom)
  if (top >= ta.scrollTop && top + lineHeight <= visibleBottom) return
  ta.scrollTop = Math.max(0, top - ta.clientHeight / 3)
}
