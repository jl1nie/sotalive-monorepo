// 旧版の index.html が壊れていないか(node --test packages/shared/tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkLegacyHtml } from './legacy-html.mjs';

const APPS = ['myqth-org', 'myact-org'];

for (const app of APPS) {
  test(`${app}: HTML が閉じていて、インラインの script が JS として読める`, () => {
    const html = readFileSync(new URL(`../../../apps/${app}/index.html`, import.meta.url), 'utf8');
    assert.deepEqual(checkLegacyHtml(html, `${app}/index.html`), []);
  });
}

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
