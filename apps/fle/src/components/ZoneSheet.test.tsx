// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ZoneSheet } from './ZoneSheet'

// jsdom の <dialog> には showModal・close がない(シートは <dialog> で開く)
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false
  }
})
afterEach(cleanup)

describe('ZoneSheet', () => {
  it('時間帯の行のないログを読み込んだとき、設定の時間帯か UTC かを選ぶ', () => {
    const onLocal = vi.fn()
    const onUtc = vi.fn()
    render(<ZoneSheet open zone="JST" onClose={() => {}} onLocal={onLocal} onUtc={onUtc} />)
    expect(screen.getByText('このログには時間帯(timezone)の行がありません。時刻はどちらで書きましたか?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'JST で書いた' }))
    expect(onLocal).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'UTC で書いた' }))
    expect(onUtc).toHaveBeenCalledOnce()
  })

  it('閉じていれば、何も出さない', () => {
    render(<ZoneSheet open={false} zone="JST" onClose={() => {}} onLocal={() => {}} onUtc={() => {}} />)
    expect(screen.queryByRole('button', { name: 'JST で書いた' })).toBeNull()
  })
})
