import { describe, expect, it } from 'vitest'
import { createPrefs, loadPrefs, parseUuid, type CookieIO } from './prefs.ts'

const memory = (initial: Record<string, string> = {}) => {
  const jar = { ...initial }
  const io: CookieIO = { get: (k) => jar[k], set: (k, v) => { jar[k] = v } }
  return { io, jar }
}

describe('設定(旧版の Cookie と、同じ名前・同じ値の形)', () => {
  it('Cookie がなければ、既定(ログは出さない・Activator・UUID なし)', () => {
    expect(loadPrefs(memory().io)).toEqual({
      show_potalog: false, show_potaactlog: true, pota_activator_uuid: null, pota_hunter_uuid: null,
      popup_permanent: true, display_mapcode: false, link_googlemap: false, sota_ref: true, pota_ref: true, jaff_ref: true, zoom_threshold: 12,
    })
  })

  it("真偽は 'true' だけが true。UUID は、''・'null'・'undefined'(以前の版が保存した)を、登録なし(null)に読む", () => {
    const p = loadPrefs(memory({ show_potalog: 'true', show_potaactlog: 'false', pota_activator_uuid: 'act-1', pota_hunter_uuid: 'undefined' }).io)
    expect(p).toMatchObject({ show_potalog: true, show_potaactlog: false, pota_activator_uuid: 'act-1', pota_hunter_uuid: null })
    expect(parseUuid('')).toBeNull()
    expect(parseUuid('null')).toBeNull()
    expect(parseUuid('x')).toBe('x')
  })

  it("保存: 真偽は 'true'/'false'、登録なしの UUID は 'null'(旧版が読める形)", () => {
    const { io, jar } = memory()
    const prefs = createPrefs(io)
    prefs.set({ show_potalog: true, pota_activator_uuid: 'act-1' })
    prefs.set({ pota_activator_uuid: null })
    expect(jar).toEqual({ show_potalog: 'true', pota_activator_uuid: 'null' })
  })

  it('logId(旧版の getLogID): ログを出さない設定なら null。出すなら、Activator か Hunter の UUID', () => {
    const { io } = memory({ pota_activator_uuid: 'act-1', pota_hunter_uuid: 'hunt-1' })
    const prefs = createPrefs(io)
    expect(prefs.logId()).toBeNull()
    prefs.set({ show_potalog: true })
    expect(prefs.logId()).toBe('act-1')
    prefs.set({ show_potaactlog: false })
    expect(prefs.logId()).toBe('hunt-1')
    prefs.set({ pota_hunter_uuid: null })
    expect(prefs.logId()).toBeNull()
  })

  it('旧版の設定: 真偽 \'false\' は false。zoom_threshold は数値(Cookie は文字列)', () => {
    const p = loadPrefs(memory({ pota_ref: 'false', popup_permanent: 'false', zoom_threshold: '9', link_googlemap: 'true' }).io)
    expect(p).toMatchObject({ pota_ref: false, popup_permanent: false, zoom_threshold: 9, link_googlemap: true, jaff_ref: true })
  })

  it('変更を購読できる', () => {
    const prefs = createPrefs(memory().io)
    const seen: boolean[] = []
    prefs.subscribe((p) => seen.push(p.show_potalog))
    prefs.set({ show_potalog: true })
    expect(seen).toEqual([true])
  })
})
