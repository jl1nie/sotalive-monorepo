// actzone.js の最高点の探索のテスト(node --test packages/shared/tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// ブラウザー用のスクリプトを、Leaflet の最小の代用品の上で読み込む
const sandbox = { L: { GridLayer: { extend: (o) => o }, Util: {} }, module: { exports: {} }, Math };
vm.runInNewContext(readFileSync(new URL('../common/js/actzone.js', import.meta.url), 'utf8'), sandbox);
const { findPeak } = sandbox.module.exports;

// 全画素 base m のタイル。points は [[x, y, h], ...](タイル内の座標)
function tile(base, points = []) {
  const e = new Array(65536).fill(base);
  for (const [x, y, h] of points) e[y * 256 + x] = h;
  return e;
}

test('タイルの中では、±3 画素で最も高い画素を選ぶ', () => {
  const t = tile(100, [[12, 20, 130], [10, 10, 999]]); // (10,10) は範囲外
  const r = findPeak(10, 18, (dx, dy) => (dx === 0 && dy === 0 ? t : null));
  assert.deepEqual([r.cx, r.cy, r.peak, r.moved], [12, 20, 130, true]);
});

test('右の端では、隣の行の反対側ではなく、右のタイルを読む', () => {
  // 以前は (254, 50) の右 2 画素を、次の行の左端 (0, 51) として読んでいた
  const center = tile(100, [[0, 51, 999]]);
  const right = tile(100, [[0, 50, 120]]);
  const demAt = (dx, dy) => (dy !== 0 ? null : dx === 0 ? center : dx === 1 ? right : null);
  const r = findPeak(254, 50, demAt);
  assert.equal(r.peak, 120);
  assert.deepEqual([r.cx, r.cy], [256, 50]); // 山頂のタイルから見た座標(右のタイルの (0, 50))
});

test('左上の角では、左・上・左上のタイルも読む', () => {
  const tiles = {
    '0,0': tile(100),
    '-1,0': tile(100),
    '0,-1': tile(100),
    '-1,-1': tile(100, [[254, 254, 140]]),
  };
  const r = findPeak(1, 1, (dx, dy) => tiles[`${dx},${dy}`]);
  assert.equal(r.peak, 140);
  assert.deepEqual([r.cx, r.cy], [-2, -2]);
});

test('標高が取れないタイルは飛ばす', () => {
  const center = tile(100, [[255, 10, 110]]);
  const r = findPeak(255, 10, (dx, dy) => (dx === 0 && dy === 0 ? center : undefined));
  assert.deepEqual([r.cx, r.cy, r.peak], [255, 10, 110]);
});
