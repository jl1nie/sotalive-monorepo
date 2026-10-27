// 旧版を、固定の応答で動かし、シナリオの出力を記録(record)または比較(verify)する。
//   node src/run.mjs record [名前の一部]   expected/<name>.json を書く
//   node src/run.mjs verify [名前の一部]   旧版を走らせ直して、expected と比べる。違えば終了コード 1
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, close, openLegacy, ORIGIN } from './harness.mjs';
import { scenarios } from './scenarios.mjs';

const EXPECTED = fileURLToPath(new URL('../expected/', import.meta.url));
const [mode, filter = ''] = process.argv.slice(2);
if (!['record', 'verify'].includes(mode)) {
  console.error('使い方: node src/run.mjs record|verify [名前の一部]');
  process.exit(2);
}

async function runOne(sc) {
  // setup が関数なら、実行ごとに作る(模擬サーバーの状態を、シナリオ間で引き継がない)
  const h = await openLegacy(typeof sc.setup === 'function' ? sc.setup() : (sc.setup ?? {}));
  try {
    h.resetCalls();
    const out = await sc.run(h.page, h);
    const cookies = (await h.context.cookies(ORIGIN)).filter((c) => c.name.startsWith('my_qth') || c.name.includes('uuid')).map((c) => `${c.name}=${c.value}`).sort();
    const external = h.externalCalls.length ? { externalCalls: [...h.externalCalls] } : {};
    return { ...out, ...external, apiCalls: [...h.apiCalls], dialogs: h.dialogs, errors: h.errors, cookies };
  } finally {
    await h.context.close();
  }
}

await launch();
mkdirSync(EXPECTED, { recursive: true });
let failed = 0;
for (const sc of scenarios.filter((s) => s.name.includes(filter))) {
  let actual;
  try {
    actual = await runOne(sc);
  } catch (e) {
    console.log(`✖ ${sc.name}: 実行できない: ${e.message.split('\n')[0]}`);
    failed++;
    continue;
  }
  const text = JSON.stringify(actual, null, 2) + '\n';
  const file = `${EXPECTED}${sc.name}.json`;
  if (mode === 'record') {
    writeFileSync(file, text);
    console.log(`記録 ${sc.name}`);
  } else if (!existsSync(file)) {
    console.log(`✖ ${sc.name}: 期待値がない(record する)`);
    failed++;
  } else if (readFileSync(file, 'utf8') !== text) {
    const a = readFileSync(file, 'utf8').split('\n');
    const b = text.split('\n');
    const i = a.findIndex((l, k) => l !== b[k]);
    console.log(`✖ ${sc.name}: ${i + 1} 行目から違う\n    期待: ${a[i]}\n    実際: ${b[i]}`);
    failed++;
  } else {
    console.log(`✔ ${sc.name}`);
  }
}
await close();
if (failed) {
  console.log(`\nVERIFY FAIL: ${failed} 件`);
  process.exit(1);
}
console.log(mode === 'verify' ? '\nVERIFY PASS' : '\n記録した');
