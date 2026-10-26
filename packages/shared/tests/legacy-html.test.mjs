// 旧版の index.html が壊れていないか(node --test packages/shared/tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { checkLegacyHtml } from './legacy-html.mjs';

const APPS = ['myqth-org', 'myact-org'];

for (const app of APPS) {
  test(`${app}: HTML が閉じていて、インラインの script が JS として読める`, () => {
    const html = readFileSync(new URL(`../../../apps/${app}/index.html`, import.meta.url), 'utf8');
    assert.deepEqual(checkLegacyHtml(html, `${app}/index.html`), []);
  });
}

// 外に出した JS(src="js/…")が、共通アセットにあり、JS として読めること
for (const app of APPS) {
  test(`${app}: src="js/…" の script が、共通アセットにあって、JS として読める`, () => {
    const html = readFileSync(new URL(`../../../apps/${app}/index.html`, import.meta.url), 'utf8');
    const srcs = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["'](js\/[^"'?]+)["']/gi)].map((m) => m[1]);
    assert.ok(srcs.includes('js/escape-html.js') && srcs.length > 3);
    for (const src of srcs) {
      const file = new URL(`../common/${src}`, import.meta.url);
      assert.ok(existsSync(file), `${app}: ${src} がない`);
      assert.doesNotThrow(() => new vm.Script(readFileSync(file, 'utf8'), { filename: src }), src);
    }
  });
}

test('escapeHTML: & < > " \' を置き換える。null・undefined は文字にする', () => {
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../common/js/escape-html.js', import.meta.url), 'utf8'), ctx);
  assert.equal(ctx.escapeHTML(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(ctx.escapeHTML(null), 'null');
});

test('関数が </html と > のあいだに入った HTML(#128 のバグ)を見つける', () => {
  const broken = '<html><body><script>\nfoo();\n</script>\n</body>\n</html\n\nfunction foo() {}>';
  assert.equal(checkLegacyHtml(broken).length, 1);
});

test('インラインの script の構文の誤りと、閉じていない script を見つける', () => {
  assert.match(checkLegacyHtml('<html><script>if (</script></html>')[0], /script/);
  assert.match(checkLegacyHtml('<html><script>a()\n</html>')[0], /<script> が 1 個/);
  // src の script と、JS でない type は読まない
  assert.deepEqual(checkLegacyHtml('<html><script src="a.js"></script><script type="text/template"><%= x %></script></html>'), []);
});
