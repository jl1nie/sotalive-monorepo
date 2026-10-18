import { describe, expect, it } from 'vitest'
import {
  clearPrev,
  loadLastCall,
  loadLog,
  loadPrev,
  rememberPrev,
  saveLastCall,
  saveLog,
  type KV,
} from './storage'

function memoryKv(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

/** 容量超過のように、書き込みだけが失敗する保存先 */
function fullKv(): KV {
  return {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('quota', 'QuotaExceededError')
    },
    removeItem: () => {},
  }
}

describe('saveLog / loadLog', () => {
  it('保存した内容をそのまま読み戻せる', () => {
    const kv = memoryKv()
    expect(saveLog('mycall JA1ABC\n0900 JA1XYZ\n', kv)).toBe(true)
    expect(loadLog(kv)).toBe('mycall JA1ABC\n0900 JA1XYZ\n')
  })

  it('空にしたら、保存していた内容を消す', () => {
    const kv = memoryKv()
    saveLog('abc', kv)
    expect(saveLog('', kv)).toBe(true)
    expect(loadLog(kv)).toBe('')
    expect(kv.data.size).toBe(0)
  })

  it('何も保存していなければ空文字', () => {
    expect(loadLog(memoryKv())).toBe('')
  })

  it('書き込みに失敗したら false を返し、例外は投げない', () => {
    expect(saveLog('abc', fullKv())).toBe(false)
  })

  it('保存先が使えない環境(null)でも例外にならない', () => {
    expect(saveLog('abc', null)).toBe(false)
    expect(loadLog(null)).toBe('')
  })

  it('改行や日本語を含むログも壊さない', () => {
    const kv = memoryKv()
    const text = '4 ja4qru 6 7 <曽田さん>{島根市}\r\n58 jk2qsu {PM85rl}\n'
    saveLog(text, kv)
    expect(loadLog(kv)).toBe(text)
  })
})

describe('rememberPrev / loadPrev / clearPrev', () => {
  it('置き換える前の内容を1世代だけ取っておく', () => {
    const kv = memoryKv()
    rememberPrev('first', kv)
    rememberPrev('second', kv)
    expect(loadPrev(kv)).toBe('second')
  })

  it('空白だけの内容は取っておかない(直前の内容を上書きしない)', () => {
    const kv = memoryKv()
    rememberPrev('keep me', kv)
    rememberPrev('  \n', kv)
    expect(loadPrev(kv)).toBe('keep me')
  })

  it('消せる', () => {
    const kv = memoryKv()
    rememberPrev('x', kv)
    clearPrev(kv)
    expect(loadPrev(kv)).toBe('')
  })

  it('ログ本体とは別のキーに入る', () => {
    const kv = memoryKv()
    saveLog('log', kv)
    rememberPrev('prev', kv)
    expect(loadLog(kv)).toBe('log')
  })
})

describe('loadLastCall / saveLastCall', () => {
  it('前回のコールサインを覚える(/1 などの付いたものも)', () => {
    const kv = memoryKv()
    saveLastCall('JA1ABC/1', kv)
    expect(loadLastCall(kv)).toBe('JA1ABC/1')
  })

  it('空のコールサインでは、覚えているものを消さない', () => {
    const kv = memoryKv()
    saveLastCall('JA1ABC', kv)
    saveLastCall('  ', kv)
    expect(loadLastCall(kv)).toBe('JA1ABC')
  })

  it('保存先が使えなくても例外にならない', () => {
    expect(() => saveLastCall('JA1ABC', fullKv())).not.toThrow()
    expect(loadLastCall(null)).toBe('')
  })
})
