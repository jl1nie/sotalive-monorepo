// 新しい MyQTH(apps/myqth)を、本物のブラウザー(Playwright の Chromium)で開くテスト。
//   pnpm --filter @sotalive/myqth build && node --test apps/myqth/e2e/myqth.e2e.mjs
// ビルドした dist を手元で配る。外部の API(国土地理院・sotaapp2)は固定の応答に差し替え、地図のタイルなどは空にする。
// 旧版(packages/shared/tests/legacy.e2e.mjs)と同じ固定の応答・同じ確認(ポップアップの文言)で、見た目の中身を揃える。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const ORIGIN = 'https://myqth.test';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const TOKYO = { latitude: 35.681236, longitude: 139.767125 };

const STUB = {
  LonLatToAddress: { results: { muniCd: '13101', lv01Nm: '丸の内一丁目' } },
  'jcc-jcg': { muniCode: 13101, prefecture: '東京都', municipality: '千代田区', jccCode: '100101', wardCode: null, maidenhead: 'PM95vq' },
  getelevation: { elevation: 3.2, hsrc: '（5m（レーザ））' },
};

let browser;
before(async () => {
  assert.ok(existsSync(join(DIST, 'index.html')), 'dist がない。先に pnpm --filter @sotalive/myqth build');
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

/**
 * 新版を開いたページと、起きた JS の例外・alert の文面。
 * geolocation: 現在地(なければ、位置情報は許可しない)、noGeolocation: 位置情報のないブラウザー、
 * failGsi: 国土地理院の API が 500、noHsrc: 標高の応答に hsrc がない、cookies: 前回の位置、
 * init: ページの前に走らせるスクリプト(位置情報の差し替えなど)、fakeClock: 時間を進められるようにする
 */
async function openApp({ geolocation, noGeolocation = false, failGsi = false, noHsrc = false, cookies = [], init, fakeClock = false } = {}) {
  const context = await browser.newContext(geolocation ? { geolocation, permissions: ['geolocation'] } : {});
  if (cookies.length) await context.addCookies(cookies.map((c) => ({ ...c, url: ORIGIN })));
  const page = await context.newPage();
  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    d.dismiss();
  });
  if (fakeClock) await page.clock.install();
  if (init) await page.addInitScript(init);
  if (noGeolocation) await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => undefined }));
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const ok = (body, type) => route.fulfill({ status: 200, contentType: type, body });
    if (url.origin === ORIGIN) {
      const file = join(DIST, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (existsSync(file)) return ok(readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream');
      return route.fulfill({ status: 404, body: '' });
    }
    if (failGsi && url.hostname.endsWith('gsi.go.jp')) return route.fulfill({ status: 500, body: '' });
    if (noHsrc && url.pathname.includes('getelevation')) return ok(JSON.stringify({ elevation: 3.2 }), 'application/json');
    for (const [key, body] of Object.entries(STUB)) {
      if (url.pathname.includes(key)) return ok(JSON.stringify(body), 'application/json');
    }
    if (['image', 'font', 'media'].includes(req.resourceType())) return route.fulfill({ status: 204, body: '' });
    return route.abort();
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => typeof window.map === 'object', null, { timeout: 15000 });
  return { page, context, errors, dialogs };
}

const clickTokyo = (page) => page.evaluate(() => window.map.fire('click', { latlng: window.L?.latLng?.(35.681236, 139.767125) ?? { lat: 35.681236, lng: 139.767125 } }));

test('地図をクリックすると、JCC・住所・標高のポップアップが出る(旧版と同じ文言)', async () => {
  const { page, context, errors } = await openApp();
  await clickTokyo(page);
  const popup = page.locator('.leaflet-popup-content');
  await popup.waitFor({ timeout: 10000 });
  const text = await popup.innerText();
  assert.match(text, /JCC100101/);
  assert.match(text, /東京都千代田区丸の内一丁目/);
  assert.match(text, /GL:PM95vq/);
  assert.match(text, /標高:3\.2m/);
  assert.match(text, /\[5m（レーザ）\]/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('標高の応答に hsrc がなくても、ポップアップが出る', async () => {
  const { page, context, errors } = await openApp({ noHsrc: true });
  await clickTokyo(page);
  const popup = page.locator('.leaflet-popup-content');
  await popup.waitFor({ timeout: 10000 });
  assert.match(await popup.innerText(), /JCC100101/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('国土地理院の API が 500 でも、例外を出さず「取得できませんでした」を出す(圏外とは別)', async () => {
  const { page, context, errors } = await openApp({ failGsi: true });
  await clickTokyo(page);
  const popup = page.locator('.leaflet-popup-content');
  await popup.waitFor({ timeout: 10000 });
  const text = await popup.innerText();
  assert.match(text, /住所を取得できませんでした/);
  assert.doesNotMatch(text, /Pos:/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('現在地が取れると、黄色のマーカーを立てて、見出しのポップアップを出し、位置を Cookie に覚える', async () => {
  const { page, context, errors } = await openApp({ geolocation: TOKYO });
  const popup = page.locator('.leaflet-popup-content h4');
  await popup.waitFor({ timeout: 10000 });
  assert.match(await popup.innerText(), /JCC100101/);
  assert.equal(await page.locator('.qth-marker').count(), 1);
  assert.equal(await page.evaluate(() => window.map.getZoom()), 15);
  const cookies = Object.fromEntries((await context.cookies()).map((c) => [c.name, c.value]));
  assert.equal(cookies.my_qth_lat, '35.681236');
  assert.equal(cookies.my_qth_lng, '139.767125');
  assert.deepEqual(errors, []);
  await context.close();
});

test('位置情報が許可されないと、知らせて、前回の位置(Cookie)の地図を出す', async () => {
  const { page, context, errors, dialogs } = await openApp({
    cookies: [
      { name: 'my_qth_lat', value: '35.5' },
      { name: 'my_qth_lng', value: '139.5' },
    ],
  });
  await page.waitForFunction(() => window.map.getZoom() === 13, null, { timeout: 15000 });
  assert.deepEqual(dialogs, ['位置情報の利用が許可されていません']);
  const c = await page.evaluate(() => window.map.getCenter());
  assert.ok(Math.abs(c.lat - 35.5) < 0.01 && Math.abs(c.lng - 139.5) < 0.01);
  assert.deepEqual(errors, []);
  await context.close();
});

test('位置情報が許可されず、前回の位置もなければ、日本全体の地図を出す', async () => {
  const { page, context, errors, dialogs } = await openApp();
  await page.waitForFunction(() => window.map.getZoom() === 6, null, { timeout: 15000 });
  assert.deepEqual(dialogs, ['位置情報の利用が許可されていません']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('位置情報のないブラウザーでは、知らせて日本全体の地図を出す(例外が出ない)', async () => {
  const { page, context, errors, dialogs } = await openApp({ noGeolocation: true });
  assert.deepEqual(dialogs, ['ブラウザが位置情報取得に対応していません']);
  assert.equal(await page.evaluate(() => window.map.getZoom()), 6);
  assert.deepEqual(errors, []);
  await context.close();
});

const banner = (page) => page.locator('.locate-status');

test('現在地が取れたら、取得中の帯は消える', async () => {
  const { page, context } = await openApp({ geolocation: TOKYO });
  await page.locator('.leaflet-popup-content h4').waitFor({ timeout: 10000 });
  assert.equal(await banner(page).isVisible(), false);
  await context.close();
});

test('許可の確認が保留のまま(コールバックが呼ばれない)だと、取得中を出し、15 秒で「QTH を押し直す」案内に替わる', async () => {
  const { page, context } = await openApp({
    fakeClock: true,
    init: () => {
      navigator.geolocation.getCurrentPosition = () => {}; // 許可の確認が保留のまま
      Object.defineProperty(navigator, 'permissions', { value: { query: async () => ({ state: 'prompt' }) } });
    },
  });
  await banner(page).waitFor({ timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('.locate-status')?.textContent?.includes('「許可」を選んでください'));
  await page.clock.fastForward(16000);
  assert.match(await banner(page).innerText(), /保留のまま/);
  assert.match(await banner(page).innerText(), /QTH/);
  // タップで消える
  await banner(page).click();
  assert.equal(await banner(page).isVisible(), false);
  await context.close();
});

test('許可が拒否されているときは、設定の場所を案内する(アラートの文言は旧版のまま)', async () => {
  const { page, context, dialogs, errors } = await openApp({
    init: () => {
      navigator.geolocation.getCurrentPosition = (_ok, ng) => setTimeout(() => ng({ code: 1 }), 50);
      Object.defineProperty(navigator, 'permissions', { value: { query: async () => ({ state: 'denied' }) } });
    },
  });
  // 許可の状態(denied)がすぐ帯に出て、少しあとに、位置の取得の失敗のアラート(旧版と同じ文言)が出る
  await page.waitForFunction(() => document.querySelector('.locate-status')?.textContent?.includes('設定'));
  assert.match(await banner(page).innerText(), /位置情報が許可されていません/);
  for (let i = 0; i < 50 && dialogs.length === 0; i++) await page.waitForTimeout(100);
  assert.deepEqual(dialogs, ['位置情報の利用が許可されていません']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('Permissions API がないブラウザーでも、取得中を出して、例外にならない', async () => {
  const { page, context, errors } = await openApp({
    fakeClock: true,
    init: () => {
      navigator.geolocation.getCurrentPosition = () => {};
      Object.defineProperty(navigator, 'permissions', { value: undefined });
    },
  });
  await banner(page).waitFor({ timeout: 10000 });
  assert.match(await banner(page).innerText(), /現在地を取得中/);
  assert.deepEqual(errors, []);
  await context.close();
});
