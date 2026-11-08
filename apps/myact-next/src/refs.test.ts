// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { referenceNodes, type Area, type RefPrefs } from './refs.ts'

const PREFS: RefPrefs = { pota_ref: true, jaff_ref: true }

/** referenceNodes が返す中から、最初の <a> を取り出す */
function firstLink(nodes: ReturnType<typeof referenceNodes>): HTMLAnchorElement | null {
  for (const n of nodes) if (n instanceof HTMLAnchorElement) return n
  return null
}

describe('SOTA サミットのリンク(本家はパス形式 /summit/JA/YN-098)', () => {
  it("コードの '/' を %2F にせず、そのまま残す", () => {
    const area: Area = { sota: 'JA/YN-098 Gozenyama', sota_code: 'JA/YN-098' }
    const a = firstLink(referenceNodes(area, PREFS, true))
    expect(a?.getAttribute('href')).toBe('https://summits.sota.org.uk/summit/JA/YN-098')
  })

  it('他アソシエーションでも、セグメントの区切りの / は残る', () => {
    const area: Area = { sota: 'W7W/KG-001 Example', sota_code: 'W7W/KG-001' }
    const a = firstLink(referenceNodes(area, PREFS, true))
    expect(a?.getAttribute('href')).toBe('https://summits.sota.org.uk/summit/W7W/KG-001')
  })
})
