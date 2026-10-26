// 旧版(myqth・myact)を、本物のブラウザー(Playwright の Chromium)で開く最低限のテスト。
//   node --test packages/shared/tests/legacy.e2e.mjs
// ページとその JS は手元のファイル(apps/*-org と共通アセット)。外部の API(逆ジオコーダー・標高・sotaapp2)は
// 固定の応答に差し替え、地図のタイルなどの画像は空にする。CDN のライブラリ(Leaflet・jQuery など)は本物を読む。
// ネットワークのない手元では、LEGACY_CDN_DIR に `ホスト名/パス` の形で CDN のファイルを置くと、そこから読む。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const COMMON = join(ROOT, 'packages/shared/common');
const ORIGIN = 'https://legacy.test';
const CDN = ['unpkg.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** 固定の応答(パスの一部 → JSON)。myqth は東京駅のあたり。myact は、起動で呼ぶものを空で */
const STUB = {
  LonLatToAddress: { results: { muniCd: '13101', lv01Nm: '丸の内一丁目' } },
  'jcc-jcg': { muniCode: 13101, prefecture: '東京都', municipality: '千代田区', jccCode: '100101', wardCode: null, maidenhead: 'PM95vq' },
  getelevation: { elevation: 3.2, hsrc: '（5m（レーザ））' },
  '/propagation/geomag': { kIndex: [2], aIndex: 5 },
  '/activation/aprs/track': { tracks: [] },
  '/activation/spots': [],
  '/search': { sota: [], pota: [], temples: [] },
};

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

/** `app`(apps/<app>-org)を開いたページと、起きた JS の例外。`noGeolocation` なら、位置情報のないブラウザー。`failApi` なら、sotaapp2 の API が 500 */
async function openApp(app, { noGeolocation = false, failApi = false } = {}) {
  const page = await browser.newPage();
  if (noGeolocation) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => undefined }));
  // 手元のファイル(このページ)の JS で起きた例外。CDN のライブラリの中だけで起きたものは数えない
  const errors = [];
  page.on('pageerror', (e) => (e.stack ?? '').includes(ORIGIN) && errors.push(e.message));
  // alert(位置情報が使えないときなど)は、文面を覚えて閉じる
  const dialogs = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const ok = (body, type) => route.fulfill({ status: 200, contentType: type, body });
    if (url.origin === ORIGIN) {
      if (url.pathname === '/') return ok(readFileSync(join(ROOT, `apps/${app}-org/index.html`)), 'text/html');
      const file = join(COMMON, decodeURIComponent(url.pathname));
      if (existsSync(file)) return ok(readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream');
      return route.fulfill({ status: 404, body: '' });
    }
    // sotaapp2 の API(/propagation・/activation・/search)が落ちているとき
    if (failApi && /\/(propagation|activation|search)/.test(url.pathname)) return route.fulfill({ status: 500, body: '' });
    for (const [key, body] of Object.entries(STUB)) {
      if (url.pathname.includes(key)) return ok(JSON.stringify(body), 'application/json');
    }
    if (CDN.includes(url.hostname)) {
      const mirror = process.env.LEGACY_CDN_DIR && join(process.env.LEGACY_CDN_DIR, url.hostname, url.pathname);
      if (mirror && existsSync(mirror)) return ok(readFileSync(mirror), TYPES[extname(mirror)] ?? 'text/plain');
      return route.continue();
    }
    // そのほかの API は 404。画像(地図のタイル)・フォント・埋め込みは読まない
    if (url.pathname.includes('/api/')) return route.fulfill({ status: 404, body: '' });
    if (['image', 'font', 'media'].includes(req.resourceType())) return route.fulfill({ status: 204, body: '' });
    return route.abort();
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => typeof window.map === 'object', null, { timeout: 15000 });
  return { page, errors, dialogs };
}

test('myqth: 地図をクリックすると、JCC・住所・標高のポップアップが出る', async () => {
  const { page, errors } = await openApp('myqth');
  await page.evaluate(() => window.map.fire('click', { latlng: window.L.latLng(35.681236, 139.767125) }));
  const popup = page.locator('.leaflet-popup-content');
  await popup.waitFor({ timeout: 10000 });
  const text = await popup.innerText();
  assert.match(text, /JCC100101/);
  assert.match(text, /東京都千代田区丸の内一丁目/);
  assert.match(text, /標高:3\.2m/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('myact: 起動して、JS の例外が出ない', async () => {
  const { page, errors } = await openApp('myact');
  await page.waitForTimeout(3000); // 起動のあとの読み込み(スポット・アラートなど)を待つ
  assert.deepEqual(errors, []);
  await page.close();
});

for (const app of ['myqth', 'myact']) {
  test(`${app}: 位置情報のないブラウザーでは、知らせて日本全体の地図を出す(例外が出ない)`, async () => {
    const { page, errors, dialogs } = await openApp(app, { noGeolocation: true });
    assert.deepEqual(dialogs, ['ブラウザが位置情報取得に対応していません']);
    assert.equal(await page.evaluate(() => window.map.getZoom()), 6);
    // 直す前は、alert のあと getCurrentPosition で例外になり、起動の残りの処理が止まっていた
    assert.deepEqual(errors, []);
    await page.close();
  });
}

test('myact: 起動で呼ぶ API が 500 を返しても、JS の例外が出ない', async () => {
  const { page, errors } = await openApp('myact', { failApi: true });
  await page.waitForTimeout(3000);
  assert.deepEqual(errors, []);
  await page.close();
});
