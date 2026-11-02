import { describe, expect, it } from 'vitest'
import { takeVersionChange } from './appVersion'

/** localStorage の代わり(読み書きを数える) */
function memory(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
  }
}

describe('新しい版で開いた最初の 1 回だけ知らせる(通信しない)', () => {
  it('初めて開いたときは知らせず、版を覚える', () => {
    const s = memory()
    expect(takeVersionChange('abc1234', s)).toBe(false)
    expect(s.data['fle.version']).toBe('abc1234')
  })

  it('前に開いた版と違えば知らせ、新しい版を覚える', () => {
    const s = memory({ 'fle.version': 'old0000' })
    expect(takeVersionChange('abc1234', s)).toBe(true)
    expect(s.data['fle.version']).toBe('abc1234')
  })

  it('同じ版なら知らせない(2 回目以降)', () => {
    const s = memory({ 'fle.version': 'abc1234' })
    expect(takeVersionChange('abc1234', s)).toBe(false)
  })

  it('開発中の版(dev)では知らせない', () => {
    const s = memory({ 'fle.version': 'old0000' })
    expect(takeVersionChange('dev', s)).toBe(false)
  })

  it('保存できない端末では知らせない(毎回出るよりよい)', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(takeVersionChange('abc1234', broken)).toBe(false)
  })
})
