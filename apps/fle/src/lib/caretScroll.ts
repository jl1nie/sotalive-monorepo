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
 * キャレットが見えていなければ、見えるところまでスクロールする。見えていれば動かさない。
 * 下に隠れていれば、欄の下端に(打っている行を、候補バーのすぐ上に)。上に隠れていれば、上から 1/3 に。
 * 下端の余白は、見えないところとして扱う。
 */
export function scrollCaretIntoView(ta: HTMLTextAreaElement, pos: number) {
  const style = getComputedStyle(ta)
  const lineHeight = parseFloat(style.lineHeight) || 26
  const top = caretTop(ta, pos) + parseFloat(style.paddingTop)
  const visibleBottom = ta.scrollTop + ta.clientHeight - parseFloat(style.paddingBottom)
  if (top >= ta.scrollTop && top + lineHeight <= visibleBottom) return
  ta.scrollTop =
    top > ta.scrollTop
      ? top + lineHeight - (ta.clientHeight - parseFloat(style.paddingBottom))
      : Math.max(0, top - ta.clientHeight / 3)
}

/**
 * 内容が欄より短いとき、上に余白を足して、最後の行を欄の下端に寄せる
 * (打っている行が、候補バーと数字キーのすぐ上に来る。目を上下に動かさない)。空のときは寄せない(見本の文字を上から見せる)。
 */
export function alignToBottom(ta: HTMLTextAreaElement) {
  ta.style.paddingTop = ''
  if (ta.value === '') return
  const style = getComputedStyle(ta)
  const base = parseFloat(style.paddingTop)
  const lineHeight = parseFloat(style.lineHeight) || 26
  const content = caretTop(ta, ta.value.length) + lineHeight
  const room = ta.clientHeight - base - parseFloat(style.paddingBottom) - content
  if (room > 0) ta.style.paddingTop = `${base + room}px`
}
