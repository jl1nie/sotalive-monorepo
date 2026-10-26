/**
 * 外から来た値(山・公園の名前、逆ジオコーダーの結果など)を HTML に入れるときに使う。
 * 文字列の連結と同じく null・undefined はそのまま文字にする(表示を変えない)。
 */
export function escapeHTML(v: unknown): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(v).replace(/[&<>"']/g, (c) => map[c])
}
