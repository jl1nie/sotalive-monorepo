// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { FieldKeyboard } from './FieldKeys'
import { FieldKeysContext, useFieldKeyProps } from '@/hooks/useFieldKeys'

beforeAll(() => {
  // jsdom には scrollIntoView がない
  Element.prototype.scrollIntoView = () => {}
})
afterEach(cleanup)

function Field({ label }: { label: string }) {
  const [value, setValue] = useState('')
  const keys = useFieldKeyProps()
  return <input aria-label={label} value={value} onChange={(e) => setValue(e.target.value)} {...keys} />
}

function Form({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [os, setOs] = useState(false)
  return (
    <FieldKeysContext.Provider value={{ enabled, os, setOs, keyScale: 1, onKeyScale: () => {} }}>
      <div ref={ref}>
        <Field label="call" />
        <Field label="sota" />
        <input aria-label="title" />
        <FieldKeyboard within={ref} />
      </div>
    </FieldKeysContext.Provider>
  )
}

const tapKey = (name: string | RegExp) => fireEvent.click(screen.getAllByRole('button', { name })[0])
const focus = (el: HTMLElement) => act(() => el.focus())

describe('FieldKeyboard: シートの入力欄の画面のキーボード', () => {
  it('欄にフォーカスがある間だけ出て、OS のキーボードを出さない(日本語の欄では出さない)', async () => {
    render(<Form />)
    expect(screen.queryByRole('group', { name: 'キーボード' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('call')).toHaveAttribute('inputmode', 'none')
    focus(screen.getByLabelText('call'))
    expect(screen.getByRole('group', { name: 'キーボード' })).toBeInTheDocument()
    focus(screen.getByLabelText('title'))
    // フォーカスが外れたかは、少し待ってから決める(移った先を見る)
    await waitFor(() => expect(screen.queryByRole('group', { name: 'キーボード' })).not.toBeInTheDocument())
  })

  it('英字は大文字で入り、⌫・↶ で直せる。↵ で次の欄へ', () => {
    render(<Form />)
    const call = screen.getByLabelText('call')
    focus(call)
    for (const k of ['j', 'a', '1']) tapKey(new RegExp(`^${k}`, 'i'))
    expect(call).toHaveValue('JA1')
    tapKey('1文字消す')
    expect(call).toHaveValue('JA')
    tapKey(/取り消す/)
    expect(call).toHaveValue('JA1')
    tapKey('改行')
    expect(document.activeElement).toBe(screen.getByLabelText('sota'))
  })

  it('🌐 で OS のキーボードに切り替え、「フルキーに戻る」で戻す', () => {
    render(<Form />)
    focus(screen.getByLabelText('call'))
    tapKey(/OS のキーボード/)
    expect(screen.getByLabelText('call')).not.toHaveAttribute('inputmode')
    fireEvent.click(screen.getByRole('button', { name: 'フルキーに戻る' }))
    expect(screen.getByLabelText('call')).toHaveAttribute('inputmode', 'none')
  })

  it('フルキーの配置でなければ、何もしない', () => {
    render(<Form enabled={false} />)
    focus(screen.getByLabelText('call'))
    expect(screen.getByLabelText('call')).not.toHaveAttribute('inputmode')
    expect(screen.queryByRole('group', { name: 'キーボード' })).not.toBeInTheDocument()
  })
})
