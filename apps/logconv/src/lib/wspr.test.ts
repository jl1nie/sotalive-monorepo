import { describe, expect, it } from 'vitest'
import { analyze, buildRequest, checkPlots, cleanSpots, emptyPlots, withTimes, type Plot } from './wspr'
// WSPRnet の画面からコピーしたまま(見出し・件数・フッターを含む)
import copied from '@/test/fixtures/wsprnet_spots_20261018.txt?raw'

describe('analyze', () => {
  it('余計な行を読み飛ばして、13項目の50スポットを読む', () => {
    const a = analyze(copied)
    expect(a.spots).toHaveLength(50)
    expect(a.times).toEqual(['2026-10-18 11:32', '2026-10-18 11:33', '2026-10-18 11:34'])
    expect(a.spots[0]).toEqual({ time: '2026-10-18 11:34', call: 'DL2NL', snr: 1, reporter: 'DL2NL/1', km: 0 })
    expect(a.spots[1].snr).toBe(-13)
  })

  it('空・見出しだけなら、スポットなし', () => {
    expect(analyze('').spots).toEqual([])
    expect(analyze('Spot Database\nSpecify query parameters\n\n50 spots:').times).toEqual([])
  })

  it('項目数が違う行・日付が不正な行は読まない', () => {
    const bad = [
      '2026-10-18 11:34 A 14.0 -1 0 JO31 0.2 B JO31 10 20', // 12項目
      '10/18/2026 11:34 A 14.0 -1 0 JO31 0.2 B JO31 10 20 W-2', // 日付の形式
    ].join('\n')
    expect(analyze(bad).spots).toEqual([])
  })
})

describe('plots', () => {
  const a = analyze(copied)

  it('系列は4つ。色は旧画面と同じ並びで、何も選んでいない', () => {
    const plots = emptyPlots()
    expect(plots.map((p) => p.color)).toEqual(['red', 'blue', 'green', 'cyan'])
    expect(plots.every((p) => !p.enabled && p.label === '')).toBe(true)
  })

  it('解析した直後は、開始・終了を最初と最後の時刻にし、選んだ値は残す', () => {
    const filled = withTimes(emptyPlots(), a)
    expect(filled[0]).toMatchObject({ from: '2026-10-18 11:32', to: '2026-10-18 11:34' })
    const kept = withTimes([{ ...filled[0], from: '2026-10-18 11:33', to: '2026-10-18 11:33' }], a)
    expect(kept[0]).toMatchObject({ from: '2026-10-18 11:33', to: '2026-10-18 11:33' })
    // スポットがなければ、空にする
    expect(withTimes(filled, analyze(''))[0]).toMatchObject({ from: '', to: '' })
  })

  it('読めた行だけを、1つの空白区切りに並べ直す', () => {
    const cleaned = cleanSpots(copied)
    expect(cleaned.split('\n')).toHaveLength(50)
    expect(cleaned.split('\n')[0]).toBe('2026-10-18 11:34 DL2NL 10.140193 +1 0 JO31 0.2 DL2NL/1 JO31 0 0 W-2')
    expect(cleaned).not.toMatch(/Spot Database|Query time|RoopleTheme/)
  })

  it('サーバーに送る形: 選んだ系列だけ・距離・注釈', () => {
    const plots: Plot[] = [
      { label: 'wire', color: 'blue', from: '2026-10-18 11:32', to: '2026-10-18 11:32', enabled: true },
      { label: 'rod', color: 'red', from: '2026-10-18 11:34', to: '2026-10-18 11:34', enabled: true },
      { label: 'off', color: 'green', from: '2026-10-18 11:33', to: '2026-10-18 11:33', enabled: false },
    ]
    const req = buildRequest(copied, plots, { title: 't', minKm: 100, maxKm: 5000, annotation: false })
    expect(req.plots.map((p) => p.label)).toEqual(['wire', 'rod'])
    expect(req).toMatchObject({ title: 't', min: 100, max: 5000, label: false, width: 800 })
    expect(req.spots).toBe(copied)
  })

  it('期間の誤り: 選んだ系列がない・開始が終了より後', () => {
    const p = (over: Partial<Plot>): Plot => ({
      label: 'A', color: 'blue', from: '2026-10-18 11:32', to: '2026-10-18 11:34', enabled: true, ...over,
    })
    expect(checkPlots([p({})])).toBeNull()
    expect(checkPlots([p({ enabled: false })])).toMatch('1つ以上')
    expect(checkPlots([p({ from: '2026-10-18 11:34', to: '2026-10-18 11:32' })])).toMatch('開始が終了より後')
  })
})
