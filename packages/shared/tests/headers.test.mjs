// 公園区域の TopoJSON の長期キャッシュ(scripts/write-immutable-headers.sh)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../../scripts/write-immutable-headers.sh', import.meta.url));

test('版の入った json だけに、immutable の長期キャッシュを付ける', () => {
  const out = mkdtempSync(join(tmpdir(), 'hdr-'));
  mkdirSync(join(out, 'json'));
  for (const f of ['jaffpota-annotated-v23.json', 'jaffpota-annotated-v24.json', 'settings.json']) writeFileSync(join(out, 'json', f), '{}');
  execFileSync('bash', [SCRIPT, out]);
  const h = readFileSync(join(out, '_headers'), 'utf8');
  for (const v of ['v23', 'v24']) {
    assert.match(h, new RegExp(`/json/jaffpota-annotated-${v}\\.json\\n  Cache-Control: public, max-age=31536000, immutable`));
  }
  assert.doesNotMatch(h, /settings\.json/); // 版のないファイルには付けない(変わるかもしれない)
});

test('json がなくても、空の _headers で終わる', () => {
  const out = mkdtempSync(join(tmpdir(), 'hdr-'));
  execFileSync('bash', [SCRIPT, out]);
  assert.equal(readFileSync(join(out, '_headers'), 'utf8'), '');
});
