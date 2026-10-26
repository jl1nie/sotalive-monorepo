// 旧版(jQuery)の index.html の、壊れていないかの検査。テストのない旧版で、壊れた HTML や JS の構文の誤りを
// ブラウザーで開く前に見つける(myqth の escapeHTML が </html と > のあいだに入り、ポップアップが出なかった)。
import vm from 'node:vm';

/** 見つけた問題の一覧(なければ空)。`name` は知らせるときのファイル名 */
export function checkLegacyHtml(html, name = 'index.html') {
  const problems = [];
  // </html> で終わる(後ろに何もない)。閉じていない </html や、後ろにはみ出した文字を見つける
  if (!/<\/html>\s*$/i.test(html)) problems.push(`${name}: </html> で終わっていない`);
  const opened = (html.match(/<script\b/gi) ?? []).length;
  const closed = (html.match(/<\/script>/gi) ?? []).length;
  if (opened !== closed) problems.push(`${name}: <script> が ${opened} 個、</script> が ${closed} 個`);
  // インラインの script(src のないもの)は、JS として読めること
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attrs, code] = m;
    if (/\bsrc\s*=/i.test(attrs) || /type\s*=\s*["']?(?!text\/javascript|module)[^"'\s>]+/i.test(attrs)) continue;
    const line = html.slice(0, m.index).split('\n').length;
    try {
      new vm.Script(code, { filename: `${name}:${line}` });
    } catch (e) {
      problems.push(`${name}:${line} の script: ${e.message}`);
    }
  }
  return problems;
}
