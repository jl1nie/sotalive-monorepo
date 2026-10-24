// @vitest-environment node
// 事前に `pnpm wasm` で src/wasm/fle を生成しておくこと。
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  adifToFle,
  checkOutput,
  initSync,
  compile,
  complete,
  fill,
  generateZip,
  gridLocator,
  lineInfo,
  sampleLog,
  stationAt,
  stationPlan,
} from '../wasm/fle/fle'

const SAMPLE = 'mycall JA1ABC\ndate 2024-01-15\nmysota JA/TK-001\n40m cw\n0900 JA1XYZ 599 599\n'

beforeAll(() => {
  initSync({ module: readFileSync(new URL('../wasm/fle/fle_bg.wasm', import.meta.url)) })
})

describe('fle wasm', () => {
  it('compile: 正常なログを行番号つきで返す', () => {
    const view = compile(SAMPLE)
    expect(view.status).toBe('OK')
    expect(view.mycall).toBe('JA1ABC')
    expect(view.qsos[0]).toMatchObject({ line: 4, call: 'JA1XYZ', time: '09:00', band: '40m', mode: 'CW' })
  })

  it('compile: 省略された項目は前の行から補完される', () => {
    const view = compile(SAMPLE + '05 JA1QSO\n')
    const last = view.qsos[view.qsos.length - 1]
    expect(last).toMatchObject({ call: 'JA1QSO', time: '09:05', band: '40m', mode: 'CW' })
  })

  it('compile: 誤りがあるとERRと行番号を返す', () => {
    const view = compile('mycall\n')
    expect(view.status).toBe('ERR')
    expect(view.errors).toEqual([
      { line: 0, message: 'Missing operand.', code: 'missing_operand', args: ['mycall'], from: 0, to: 6 },
    ])
  })

  it('complete: 行頭の語からキーワードと、置き換える範囲を返す', () => {
    expect(complete('mys')).toEqual({ from: 0, candidates: [{ text: 'mysota', kind: 'command' }] })
    expect(complete('mycall JA1ABC\nmys').from).toBe(14)
    expect(complete('day ')).toEqual({
      from: 4,
      candidates: [
        { text: '+', kind: 'day' },
        { text: '++', kind: 'day' },
      ],
    })
  })

  it('complete: バンドの次にモードを、改行なしで返す', () => {
    const { candidates } = complete('40m ')
    expect(candidates.slice(0, 3).map((c: { text: string }) => c.text)).toEqual(['cw', 'ssb', 'fm'])
  })

  it('complete: 自由入力の位置では何も返さない', () => {
    expect(complete('0905 ja').candidates).toEqual([])
  })

  it('fill: 時刻のない行の行頭に、いまの時刻(UTC)を入れる修正を返す', () => {
    const now = Date.UTC(2026, 9, 18, 9, 5, 30)
    expect(fill('mycall JA1ABC\nja1xyz', 1, now, 0, undefined)).toEqual([{ from: 14, to: 14, insert: '0905 ' }])
  })

  it('fill: 既定のタイムゾーンがUTC以外なら、timezone の行も入れる', () => {
    const now = Date.UTC(2026, 9, 18, 9, 5, 30)
    expect(fill('ja1xyz', 0, now, 9, undefined)).toEqual([{ from: 0, to: 0, insert: 'timezone +9\n1805 ' }])
  })

  it('fill(options): 確定する範囲を選べる(時刻は常に)', () => {
    const now = Date.UTC(2026, 9, 18, 9, 5, 30)
    const text = '40m cw\nja1xyz'
    const apply = (options?: object) =>
      (fill(text, 1, now, 0, options) as { from: number; to: number; insert: string }[])
        .sort((a, b) => b.from - a.from)
        .reduce((t, e) => t.slice(0, e.from) + e.insert + t.slice(e.to), text)
    expect(apply()).toBe('40m cw\n0905 ja1xyz')
    expect(apply({ rst: true })).toBe('40m cw\n0905 ja1xyz 599 599')
    expect(apply({ bandMode: true })).toBe('40m cw\n0905 40m CW ja1xyz')
    expect(apply({ bandMode: true, rst: true })).toBe('40m cw\n0905 40m CW ja1xyz 599 599')
  })

  it('fill: 相手のグリッドは、RST を書き込んでも残る', () => {
    const now = Date.UTC(2026, 9, 18, 9, 5, 30)
    const text = '40m cw\nja1xyz pm85rl'
    const edits = fill(text, 1, now, 0, { rst: true }) as { from: number; to: number; insert: string }[]
    const filled = edits
      .sort((a, b) => b.from - a.from)
      .reduce((t, e) => t.slice(0, e.from) + e.insert + t.slice(e.to), text)
    expect(filled).toBe('40m cw\n0905 ja1xyz 599 599 pm85rl')
    expect(compile(filled).qsos[0].grid).toBe('PM85rl')
  })

  it('adifToFle: ADIFをFLEに変換し、そのまま解釈できる', () => {
    const adif = '<CALL:6>JA1XYZ<QSO_DATE:8>20241228<TIME_ON:4>1234<MODE:2>CW<BAND:3>40m<RST_RCVD:3>579<EOR>'
    const fle = adifToFle(adif)
    expect(fle).toBe('date 2024-12-28\n40m CW\n1234 JA1XYZ 599 579\n')
    expect(compile('mycall JA1ABC\n' + fle).status).toBe('OK')
  })

  it('sampleLog: 見本は有効なFLEで、日付は渡したもの', () => {
    const view = compile(sampleLog('2026-10-18'))
    expect(view.status).toBe('OK')
    expect(view.qsos[0].date).toBe('2026-10-18')
  })

  it('stationPlan: 場所を指令の行として書き込む修正を返す', () => {
    const want = { mycall: 'ja1abc/1', sota: 'ja/tk-001', pota: ['ja-0001'], wwff: '', grid: 'pm95uq' }
    const plan = stationPlan('', 0, want)
    expect(plan.errors).toEqual([])
    expect(plan.edits[0].insert).toBe('mycall JA1ABC/1\nmysota JA/TK-001\nmypota JA-0001\nmygrid PM95uq\n')
  })

  it('stationPlan: 形式の誤りは項目ごとに返し、何も書かない', () => {
    const plan = stationPlan('', 0, { mycall: '', sota: 'xx', pota: [], wwff: '', grid: '' })
    expect(plan.edits).toEqual([])
    expect(plan.errors.map((e: { field: string }) => e.field)).toEqual(['sota'])
  })

  it('stationAt: カーソル位置で有効な場所を返す', () => {
    const text = 'mycall JA1ABC\nmysota JA/TK-001\n40m cw\n0900 ja1aaa\nmysota JA/TK-002\n'
    expect(stationAt(text, 3).sota).toBe('JA/TK-001')
    expect(stationAt(text, 5).sota).toBe('JA/TK-002')
  })

  it('gridLocator: 緯度経度からグリッドを返す', () => {
    expect(gridLocator(35.6586, 139.7454)).toBe('PM95up')
    expect(gridLocator(91, 0)).toBeUndefined()
  })

  it('checkOutput: 日付のないログは、必須の警告を返す', () => {
    const w = checkOutput('mycall JA1ABC\n40m cw\nmysota JA/TK-001\n0900 ja1aaa') as { code: string; severity: string }[]
    expect(w.map((x) => [x.code, x.severity])).toEqual([['missing_date', 'required']])
  })

  it('checkOutput: 出力前に、足りない情報を返す', () => {
    const w = checkOutput('date 2026-10-18\n40m cw\nmypota JP-0117\n0900 ja1aaa') as { code: string; severity: string; qsos: number }[]
    expect(w.map((x) => [x.code, x.severity, x.qsos])).toEqual([
      ['missing_mycall', 'required', 1],
      ['missing_grid', 'recommended', 1],
    ])
    expect(checkOutput('mycall JA1ABC\ndate 2026-10-18\n40m cw\nmypota JP-0117\nmygrid PM95pp\n0900 ja1aaa')).toEqual([])
  })

  it('fill: date を指定すると、日付が変わった行の前に day + を書く', () => {
    const text = 'date 2026-10-17\n2359 ja1aaa\njh1hhh'
    const at = Date.UTC(2026, 9, 18, 0, 1)
    const edits = fill(text, 2, at, 0, { date: true }) as { from: number; insert: string }[]
    expect(edits.map((e) => e.insert)).toEqual(['day +\n0001 '])
    // 指定しなければ、時刻だけ
    expect((fill(text, 2, at, 0, undefined) as { insert: string }[]).map((e) => e.insert)).toEqual(['0001 '])
  })

  it('lineInfo: 手で打った時刻が前の QSO より前なら timeBack', () => {
    const text = 'date 2026-10-17\n2359 ja1aaa\n0001 jh1hhh'
    expect(lineInfo(text, 2).timeBack).toBe(true)
    expect(lineInfo(text, 1).timeBack).toBe(false)
  })

  it('checkOutput: ? のあるコールサインを、出力の前に知らせる', () => {
    const w = checkOutput('mycall JA1ABC\ndate 2026-10-18\n40m cw\nmysota JA/TK-001\n0900 ja1ab?')
    expect(w).toEqual([{ code: 'unsure_call', field: 'call', severity: 'required', qsos: 1, items: ['JA1AB?'] }])
  })

  it('generateZip: ZIPのシグネチャで始まる', () => {
    const zip = generateZip(SAMPLE, Date.UTC(2026, 9, 18, 9, 30, 45), undefined)
    expect(zip).toBeInstanceOf(Uint8Array)
    expect(Array.from(zip.slice(0, 2))).toEqual([0x50, 0x4b]) // "PK"
  })

  it('generateZip: 空入力は例外', () => {
    expect(() => generateZip('', 0, undefined)).toThrow()
  })

  it('generateZip: HAMLOG の欄の書式を渡せる(省略すると既定)', () => {
    const at = Date.UTC(2026, 9, 18, 9, 30, 45)
    const a = generateZip(SAMPLE, at, undefined)
    const b = generateZip(SAMPLE, at, { hamlog: { qth: '{hisref}', rmks1: '{memo}', rmks2: '{myref}' } })
    expect(a).not.toEqual(b)
    expect(() => generateZip(SAMPLE, at, { hamlog: { qth: 1 } })).toThrow()
  })
})
