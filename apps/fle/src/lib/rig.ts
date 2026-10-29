import type { Completion } from '@/lib/fle'

/** 設定に持つ、よく使う `rig` の値の最大数 */
export const MAX_RIGS = 20
/** 1 件の長さの上限(同期するサーバーの上限と同じ。予定の rig の欄も 60 文字) */
export const MAX_RIG_LENGTH = 60

/**
 * 設定の「よく使うリグ」を整える: 前後の空白を除き、空・重複を除く。
 * HAMLOG の `Rig=` の右辺なので、`%`(HAMLOG のメッセージの区切り)は含めない。
 */
export function parseRigs(text: string): string[] {
  const seen = new Set<string>()
  const rigs: string[] = []
  for (const raw of text.split('\n')) {
    const rig = raw.trim().replace(/%/g, '').slice(0, MAX_RIG_LENGTH).trim()
    if (rig && !seen.has(rig)) {
      seen.add(rig)
      rigs.push(rig)
    }
  }
  return rigs.slice(0, MAX_RIGS)
}

/**
 * カーソルの行が `rig <値>` を打っている最中なら、設定のリグの一覧から候補を作る。
 * 値は文法でなく個人の設定なので、候補は、コアでなく画面が出す(文法はコア、動作は画面)。
 * `rig` の行でなければ null(コアの補完を使う)。
 */
export function rigCompletion(beforeCaret: string, rigs: string[]): Completion | null {
  const lineStart = beforeCaret.lastIndexOf('\n') + 1
  const m = /^(\s*rig\s+)(.*)$/i.exec(beforeCaret.slice(lineStart))
  if (!m || rigs.length === 0) return null
  const prefix = m[2].trim().toLowerCase()
  const candidates = rigs
    .filter((r) => r.toLowerCase().startsWith(prefix) && r.toLowerCase() !== prefix)
    .map((text) => ({ text, kind: 'rig' as const }))
  return { from: lineStart + m[1].length, candidates }
}
