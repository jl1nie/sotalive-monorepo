import { describe, expect, it } from 'vitest'
import { API_BASE, BACKEND_ORIGIN } from './index.ts'

describe('config', () => {
  it('バックエンドは公開ドメイン(Fly.io のアプリの URL を書かない)', () => {
    expect(BACKEND_ORIGIN).toBe('https://sotaapp2.sotalive.net')
    expect(BACKEND_ORIGIN).not.toContain('fly.dev')
  })
  it('API のベースは /api/v2(末尾に / を付けない)', () => {
    expect(API_BASE).toBe('https://sotaapp2.sotalive.net/api/v2')
    expect(API_BASE.endsWith('/')).toBe(false)
  })
})
