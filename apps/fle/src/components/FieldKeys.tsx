import { useContext, useEffect, useRef, useState, type RefObject } from 'react'
import { Keyboard } from 'lucide-react'
import { FullKeyboard } from '@/components/FullKeyboard'
import { keepFocus } from '@/lib/keepFocus'
import { useT } from '@/lib/i18n'
import { FieldKeysContext } from '@/hooks/useFieldKeys'

/** 制御された入力欄(React)の値を、打ったときと同じ経路(input イベント)で変える */
function setInputValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * シートの下端に出す、入力欄の画面のキーボード。`within`(シート)の中の、`useFieldKeyProps` を付けた欄に
 * フォーカスがある間だけ出す。↵ は次の欄へ(最後の欄なら、キーボードを閉じる)。
 * 英字は、最初は大文字(コールサインとリファレンスは大文字で書く)。
 */
export function FieldKeyboard({ within }: { within: RefObject<HTMLElement | null> }) {
  const keys = useContext(FieldKeysContext)
  const t = useT()
  const [target, setTarget] = useState<HTMLInputElement | null>(null)
  const [caps, setCaps] = useState(true)
  // 取り消し(↶)の履歴。キーで変える前の値とキャレット
  const history = useRef<{ el: HTMLInputElement; value: string; caret: number }[]>([])

  useEffect(() => {
    if (!keys.enabled) return
    const isField = (n: unknown): n is HTMLInputElement =>
      n instanceof HTMLInputElement && n.dataset.fleKeys !== undefined && !!within.current?.contains(n)
    let timer = 0
    const onIn = (e: FocusEvent) => {
      if (isField(e.target)) setTarget(e.target)
    }
    // フォーカスが別の欄へ移るときも、いったん外れる。移った先を見てから決める
    const onOut = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (!isField(document.activeElement)) setTarget(null)
      }, 0)
    }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('focusout', onOut)
    }
  }, [keys.enabled, within])

  // キーボードが出たら、欄がキーボードに隠れないところへ
  useEffect(() => {
    if (!target) return
    const id = window.requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }))
    return () => window.cancelAnimationFrame(id)
  }, [target])

  // inputmode は、フォーカスし直さないと効かない(iOS)。切り替えたら、いったん外して戻す
  useEffect(() => {
    const el = document.activeElement
    if (!(el instanceof HTMLInputElement) || el.dataset.fleKeys === undefined) return
    el.blur()
    el.focus()
  }, [keys.os])

  if (!keys.enabled || !target) return null

  const edit = (value: string, caret: number) => {
    history.current.push({ el: target, value: target.value, caret: target.selectionStart ?? target.value.length })
    if (history.current.length > 100) history.current.shift()
    setInputValue(target, value)
    target.setSelectionRange(caret, caret)
  }
  const range = () => {
    const end = target.value.length
    return [target.selectionStart ?? end, target.selectionEnd ?? end] as const
  }

  const onKey = (key: string, replacePrev = false) => {
    let [from] = range()
    const [, to] = range()
    // 続けて2回押したとき: 1回目に打った文字を置き換える(- - → ,)
    if (replacePrev && from === to && from > 0) from -= 1
    edit(target.value.slice(0, from) + key + target.value.slice(to), from + key.length)
  }
  const onBackspace = () => {
    const [from, to] = range()
    if (from !== to) edit(target.value.slice(0, from) + target.value.slice(to), from)
    else if (from > 0) edit(target.value.slice(0, from - 1) + target.value.slice(from), from - 1)
  }
  const onMove = (delta: number) => {
    const [from, to] = range()
    const base = from === to ? from : delta < 0 ? from : to
    const pos = Math.max(0, Math.min(target.value.length, base + delta))
    target.setSelectionRange(pos, pos)
  }
  const onNewline = () => {
    const fields = [...(within.current?.querySelectorAll<HTMLInputElement>('input[data-fle-keys]') ?? [])]
    const next = fields[fields.indexOf(target) + 1]
    if (next) next.focus()
    else target.blur()
  }
  const onUndo = () => {
    let i = history.current.length - 1
    while (i >= 0 && history.current[i].el !== target) i--
    if (i < 0) return
    const [h] = history.current.splice(i, 1)
    setInputValue(target, h.value)
    target.setSelectionRange(h.caret, h.caret)
  }

  return (
    <div {...keepFocus} className="sticky bottom-0 -mx-4 mt-3 px-1 bg-white dark:bg-gray-900">
      {keys.os ? (
        <button
          type="button"
          onClick={() => keys.setOs(false)}
          className="w-full h-11 rounded-lg border-2 border-gray-300 dark:border-gray-700 bg-gray-200 dark:bg-gray-800 font-bold text-sm flex items-center justify-center gap-2 active:bg-gray-300 dark:active:bg-gray-700"
        >
          <Keyboard className="w-5 h-5" aria-hidden="true" />
          {t('keys.back')}
        </button>
      ) : (
        <FullKeyboard
          onKey={onKey}
          onMove={onMove}
          onBackspace={onBackspace}
          onNewline={onNewline}
          onOsKeyboard={() => keys.setOs(true)}
          onUndo={onUndo}
          keyScale={keys.keyScale}
          onKeyScale={keys.onKeyScale}
          caps={caps}
          onToggleCaps={() => setCaps((c) => !c)}
        />
      )}
    </div>
  )
}
