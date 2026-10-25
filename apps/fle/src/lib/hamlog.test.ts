import { describe, expect, it } from 'vitest'
import {
  buildTemplate,
  DEFAULT_HAMLOG_COLUMNS,
  HAMLOG_ITEMS,
  HAMLOG_PRESETS,
  matchPreset,
  parseTemplate,
  type HamlogItem,
} from './hamlog'

describe('buildTemplate / parseTemplate: 項目の組 ⇄ 書式', () => {
  it('既定の 3 欄は、項目の組で表せて、同じ書式に戻る', () => {
    expect(parseTemplate(DEFAULT_HAMLOG_COLUMNS.qth)).toEqual(['rmks', 'hisref'])
    expect(parseTemplate(DEFAULT_HAMLOG_COLUMNS.rmks1)).toEqual(['myref'])
    expect(parseTemplate(DEFAULT_HAMLOG_COLUMNS.rmks2)).toEqual(['qsl', 'rig'])
    for (const v of Object.values(DEFAULT_HAMLOG_COLUMNS)) expect(buildTemplate(parseTemplate(v)!)).toBe(v)
  })

  it('QSL メッセージの後ろの Rig は、空白なしでつなぐ。それ以外は空白', () => {
    expect(buildTemplate(['qsl', 'rig'])).toBe('%{qslmsg}%{rig}')
    expect(buildTemplate(['myref', 'qsl', 'rig'])).toBe('{myref} %{qslmsg}%{rig}')
    expect(buildTemplate(['memo', 'rig'])).toBe('{memo} {rig}')
    expect(buildTemplate([])).toBe('')
  })

  it('選んだ順ではなく、決まった並びで作る', () => {
    expect(buildTemplate(['hisref', 'rmks'])).toBe('{rmks} {hisref}')
  })

  it('どの項目の組も、作った書式から同じ組が読める(往復)', () => {
    for (let mask = 0; mask < 1 << HAMLOG_ITEMS.length; mask++) {
      const selected = HAMLOG_ITEMS.filter((_, i) => mask & (1 << i)).map((x) => x.item as HamlogItem)
      expect(parseTemplate(buildTemplate(selected))).toEqual(selected)
    }
  })

  it('並びや書き方が違う書式は、項目では表せない(null=自由な書式)', () => {
    expect(parseTemplate('{hisref} {rmks}')).toBeNull()
    expect(parseTemplate('{myref} {myref}')).toBeNull()
    expect(parseTemplate('JA {myref}')).toBeNull()
    expect(parseTemplate('%{qslmsg}% {rig}')).toBeNull()
  })
})

describe('プリセット', () => {
  it('どのプリセットの欄も、項目で表せる', () => {
    for (const { columns } of HAMLOG_PRESETS) {
      for (const v of Object.values(columns)) expect(parseTemplate(v)).not.toBeNull()
    }
  })

  it('既定と同じなら classic。メモを Rmks1・運用先を Rmks2 にしたものは memoRmks1。ほかは null', () => {
    expect(matchPreset(DEFAULT_HAMLOG_COLUMNS)).toBe('classic')
    expect(matchPreset(HAMLOG_PRESETS[1].columns)).toBe('memoRmks1')
    expect(HAMLOG_PRESETS[1].columns).toEqual({ qth: '{rmks} {hisref}', rmks1: '{memo}', rmks2: '{myref} %{qslmsg}%{rig}' })
    expect(matchPreset({ ...DEFAULT_HAMLOG_COLUMNS, qth: '' })).toBeNull()
  })
})
