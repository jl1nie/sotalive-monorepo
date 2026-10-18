import type { SyntheticEvent } from 'react'

const prevent = (e: SyntheticEvent) => e.preventDefault()

/**
 * 押してもテキスト入力からフォーカスを奪わない(キーボードを閉じない)ための属性。
 * ブラウザによって、フォーカスが動くきっかけが pointerdown か mousedown か違うので、両方で止める。
 */
export const keepFocus = { onPointerDown: prevent, onMouseDown: prevent }
