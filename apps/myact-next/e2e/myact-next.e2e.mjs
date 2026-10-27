// 次期 MyACT(apps/myact-next)を、ビルドして、本物のブラウザー(Playwright の Chromium)で開くテスト。
//   pnpm --filter @sotalive/myact-next build && node --test apps/myact-next/e2e/myact-next.e2e.mjs
// 外部の API は、旧版の golden master(packages/myact-golden)と同じ固定の応答(world.mjs・fixtures/)に差し替える。
// **旧版が出した記録(expected/*.json)と、同じ行・同じ文言**になることを、直接比べる。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { POINTS, respond } from '../../../packages/myact-golden/src/world.mjs';
import { logServer } from '../../../packages/myact-golden/src/scenarios-potalog.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const GOLDEN = fileURLToPath(new URL('../../../packages/myact-golden/expected/', import.meta.url));
const ORIGIN = 'https://myact.test';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const expected = (name) => JSON.parse(readFileSync(`${GOLDEN}${name}.json`, 'utf8'));

let browser;
before(async () => {
  assert.ok(existsSync(join(DIST, 'index.html')), 'dist がない。先に pnpm --filter @sotalive/myact-next build');
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

/**
 * 新版を開く。cookies: 設定(旧版と同じ名前と値)、state: world.respond に渡す状態(POTA ログのサーバーなど)、
 * search: URL のクエリ、gps: 現在地を返す(なければ、取得が保留のまま)
 */
async function open({ cookies = {}, state = {}, search = '', gps } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await context.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value: String(value), url: ORIGIN })));
  const page = await context.newPage();
  const errors = [];
  const dialogs = [];
  const apiCalls = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => (dialogs.push(d.message()), d.dismiss()));
  await page.addInitScript((g) => {
    navigator.geolocation.getCurrentPosition = (ok) => { if (g) setTimeout(() => ok({ coords: { latitude: g.latitude, longitude: g.longitude } }), 0); };
  }, gps ?? null);
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const send = (body, type, status = 200) => route.fulfill({ status, contentType: type, body });
    if (url.origin === ORIGIN) {
      const file = join(DIST, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (existsSync(file)) return send(readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream');
      return send('', 'text/plain', 404);
    }
    const r = respond(req.url(), req.method(), req.postData(), state);
    if (r) {
      if (url.hostname === 'sotaapp2.sotalive.net') apiCalls.push(`${req.method()} ${url.pathname.replace('/api/v2', '')}${url.search}`);
      return send(r.body, 'application/json', r.status);
    }
    if (['image', 'font', 'media'].includes(req.resourceType())) return route.fulfill({ status: 204, body: '' });
    if (url.hostname === 'sotaapp2.sotalive.net') return send('{}', 'application/json', 404);
    return route.abort();
  });
  await page.goto(`${ORIGIN}/${search}`);
  await page.waitForFunction(() => typeof window.map === 'object', null, { timeout: 15000 });
  return { page, context, errors, dialogs, apiCalls };
}

/** ポップアップの行(旧版の golden master と同じ取り出し方) */
async function popupLines(page) {
  await page.locator('.leaflet-popup-content').last().waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const n = (t) => t.replace(/\s+/g, ' ').trim();
    return document.querySelector('.leaflet-popup-content').innerText.split('\n').map(n).filter(Boolean);
  });
}
const clickMap = (page, [lat, lng]) => page.evaluate(([la, ln]) => window.map.fire('click', { latlng: { lat: la, lng: ln } }), [lat, lng]);
const cookieMap = async (context) => Object.fromEntries((await context.cookies(ORIGIN)).map((c) => [c.name, c.value]));

// ---- ポップアップ: 旧版の記録と、同じ行 ----
for (const [name, point] of [
  ['blank-tokyo', POINTS.tokyo],
  ['blank-near-summit-oyama', [POINTS.oyama[0] + 0.0005, POINTS.oyama[1] + 0.0005]],
  ['blank-summit-fuji-outside', POINTS.fuji],
  ['blank-sea-outside', POINTS.sea],
]) {
  test(`地図の空白をクリック(${name}): 旧版の記録(golden master)と、同じ行・同じ文言`, async () => {
    const { page, context, errors } = await open();
    await clickMap(page, point);
    assert.deepEqual(await popupLines(page), expected(name).popup.text);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('リンクは、新しいタブで開き、rel=noopener を付ける(旧版にない。意図した差分)', async () => {
  const { page, context } = await open();
  await clickMap(page, POINTS.tokyo);
  await popupLines(page);
  const links = await page.evaluate(() => [...document.querySelectorAll('.leaflet-popup-content a')].map((a) => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })));
  assert.equal(links.length, 2); // 位置(地理院地図)と天気(Windy)
  for (const l of links) assert.deepEqual([l.target, l.rel], ['_blank', 'noopener']);
  assert.match(links[0].href, /^https:\/\/maps\.gsi\.go\.jp\/#\d+\/35\.681236\/139\.767125$/);
  await context.close();
});

test('URL で位置とズームを指定すると、そのズームで開き、天気リンクのズームも同じ(旧版で、アニメーションのせいで 6 になった不具合の確認)', async () => {
  const { page, context, errors } = await open({ search: '?lat=35.681236&lon=139.767125&z=9' });
  await popupLines(page);
  assert.equal(await page.evaluate(() => window.map.getZoom()), 9);
  assert.match(await page.locator('.leaflet-popup-content a.weather').getAttribute('href'), /,9$/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('外から来る値は、HTML として解釈しない(山の名前に、タグが入っていても)', async () => {
  const { page, context } = await open({
    state: { handlers: [({ path }) => (path.endsWith('/sota/summits/search') ? { status: 200, body: JSON.stringify([{ summitCode: 'JA/XX-001', summitName: '<img src=x onerror=alert(1)>', summitNameJ: '<b>山</b>', cityJ: '市', altM: 1, latitude: 35, longitude: 139, maidenhead: 'PM95', points: 1, bonusPoints: 0, activationCount: 0, activationDate: null, activationCall: null }]) } : null)] },
  });
  await clickMap(page, POINTS.tokyo);
  await popupLines(page);
  assert.equal(await page.locator('.leaflet-popup-content img').count(), 0);
  assert.equal(await page.locator('.leaflet-popup-content b b').count(), 0);
  await context.close();
});

// ---- POTA ログ(必須) ----
const LOGS = { 'act-1': '2026-09-01', 'hunt-1': '2026-08-01' };
const potaState = () => ({ handlers: logServer(LOGS) });
const openDialog = async (page) => {
  await page.click('#potalog-button');
  await page.waitForSelector('dialog.pl-dialog[open]');
};
const updated = (page) => page.locator('.pl-updated').allInnerTexts();

test('POTA ログ: ナビバーから開き、登録してある UUID の最終更新を出す(旧版の「確認」)', async () => {
  const { page, context, errors } = await open({ cookies: { pota_activator_uuid: 'act-1', pota_hunter_uuid: 'hunt-1', show_potalog: 'true' }, state: potaState() });
  await openDialog(page);
  await page.waitForFunction(() => [...document.querySelectorAll('.pl-updated')].every((e) => /更新$/.test(e.textContent)));
  assert.deepEqual(await updated(page), ['2026-09-01 更新', '2026-08-01 更新']);
  assert.equal(await page.locator('#pl-show').isChecked(), true);
  assert.equal(await page.locator('#pl-activator').isChecked(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('POTA ログ: アップロードすると、旧版と同じ Cookie の値で、UUID・表示の設定を保存する(切り替えても、引き継がれる)', async () => {
  const { page, context, apiCalls } = await open({ state: potaState() });
  await openDialog(page);
  await page.setInputFiles('#pl-file', { name: 'activator.csv', mimeType: 'text/csv', buffer: Buffer.from('Reference\nJP-0118\n') });
  await page.getByRole('button', { name: 'アップロード' }).click();
  await page.waitForFunction(() => document.querySelector('.pl-updated')?.textContent === '2026-10-01 更新');
  const cookies = await cookieMap(context);
  assert.equal(cookies.pota_activator_uuid, 'act-new');
  assert.ok(['null', undefined].includes(cookies.pota_hunter_uuid));
  assert.equal(cookies.show_potalog, 'true');
  assert.equal(cookies.show_potaactlog, 'true');
  assert.ok(apiCalls.includes('POST /pota/log/null/null'), apiCalls.join(' | ')); // 旧版と同じ宛先(登録なしは null)
  await context.close();
});

test('POTA ログ: 不正なファイル・ファイルなし・見つからない共有キーは、メッセージを出す(旧版の alert と同じ文言)', async () => {
  const { page, context, dialogs } = await open({ state: potaState() });
  await openDialog(page);
  await page.getByRole('button', { name: 'アップロード' }).click();
  assert.equal(await page.locator('.pl-status').innerText(), 'ファイルを指定してください');
  await page.setInputFiles('#pl-file', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('x') });
  await page.getByRole('button', { name: 'アップロード' }).click();
  await page.waitForFunction(() => document.querySelector('.pl-status')?.textContent.startsWith('不正なログファイルの形式です'));
  await page.fill('#pl-import', 'ZZZ999');
  await page.getByRole('button', { name: '取り込む' }).click();
  await page.waitForFunction(() => document.querySelector('.pl-status')?.textContent === 'キーコードが見つかりません');
  assert.deepEqual(dialogs, []); // alert ではなく、ダイアログの中に出す
  await context.close();
});

test('POTA ログ: 共有キーの EXPORT・IMPORT と、Activator の削除', async () => {
  const { page, context } = await open({ cookies: { pota_activator_uuid: 'act-1', pota_hunter_uuid: 'hunt-1', show_potalog: 'true', show_potaactlog: 'true' }, state: potaState() });
  await openDialog(page);
  await page.getByRole('button', { name: '共有キーを作る' }).click();
  await page.waitForFunction(() => document.querySelector('.pl-key')?.textContent === 'ABC123');
  await page.locator('button', { hasText: '削除' }).first().click(); // Activator
  await page.waitForFunction(() => document.querySelector('.pl-updated')?.textContent === '登録なし');
  const cookies = await cookieMap(context);
  assert.equal(cookies.pota_activator_uuid, 'null');
  assert.equal(cookies.show_potaactlog, 'false'); // 消した側でなく、もう一方の表示に切り替わる
  await context.close();
});

test('POTA ログ: Activator のログを表示にすると、地図・ポップアップの取得に log_id が付く(旧版の getLogID と同じ)', async () => {
  const { page, context, apiCalls } = await open({
    cookies: { pota_activator_uuid: 'act-1', pota_hunter_uuid: 'hunt-1', show_potalog: 'true', show_potaactlog: 'true' },
    state: potaState(),
  });
  await clickMap(page, POINTS.tokyo);
  await popupLines(page);
  assert.ok(apiCalls.some((c) => c.startsWith('GET /sota/summits/search') && c.endsWith('&log_id=act-1')), apiCalls.join(' | '));
  await context.close();
});

// ---- 現在地・画面 ----
test('現在地が取れると、見出しの付く「現在地」のポップアップを出し、位置を Cookie(旧版と同じ名前)に覚える', async () => {
  const { page, context, errors } = await open({ gps: { latitude: POINTS.tokyo[0], longitude: POINTS.tokyo[1] } });
  assert.deepEqual(await popupLines(page), expected('gps-tokyo').popup.text);
  assert.equal((await cookieMap(context)).my_qth_lat, '35.681236');
  assert.equal(await page.evaluate(() => window.map.getZoom()), 15);
  assert.deepEqual(errors, []);
  await context.close();
});

test('位置の取得が保留のままでも、日本全体の地図を出し、「取得中」の帯を出す(iPhone の Chrome で起きた不具合の確認)', async () => {
  const { page, context } = await open();
  assert.equal(await page.evaluate(() => window.map.getZoom()), 6);
  assert.equal(await page.locator('.leaflet-control-zoomlabel').innerText(), '6');
  assert.match(await page.locator('.locate-status').innerText(), /現在地を取得中/);
  await context.close();
});

test('画面: 地図が、ナビバーの下から画面の下まで埋まる(PC・iPad・iPhone の大きさ)', async () => {
  const { page, context } = await open();
  for (const size of [{ width: 1280, height: 800 }, { width: 834, height: 1194 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await page.waitForFunction(() => { const e = document.getElementById('map'); const s = window.map.getSize(); return s.x === e.clientWidth && s.y === e.clientHeight; }, null, { timeout: 5000 });
    const m = await page.evaluate(() => ({ b: document.getElementById('map').getBoundingClientRect().bottom, h: innerHeight, scroll: document.documentElement.scrollHeight }));
    assert.ok(Math.abs(m.b - m.h) <= 1 && m.scroll <= m.h + 1, JSON.stringify({ size, m }));
  }
  await context.close();
});
