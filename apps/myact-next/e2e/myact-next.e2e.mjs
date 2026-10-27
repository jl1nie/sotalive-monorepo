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
import { LOGGED } from '../../../packages/myact-golden/src/scenarios.mjs';
import { installMocks } from '../../../packages/myact-golden/src/scenarios-paddle.mjs';
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
async function open({ cookies = {}, state = {}, search = '', gps, mocks = false, external } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await context.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value: String(value), url: ORIGIN })));
  const page = await context.newPage();
  const errors = [];
  const dialogs = [];
  const apiCalls = [];
  const externalCalls = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => (dialogs.push(d.message()), d.dismiss()));
  await page.addInitScript((g) => {
    navigator.geolocation.getCurrentPosition = (ok) => { if (g) setTimeout(() => ok({ coords: { latitude: g.latitude, longitude: g.longitude } }), 0); };
  }, gps ?? null);
  if (mocks) await page.addInitScript(installMocks);
  await page.route('**/*', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const send = (body, type, status = 200) => route.fulfill({ status, contentType: type, body });
    if (url.origin === ORIGIN && url.pathname.startsWith('/json/jaffpota-annotated-v')) return send(readFileSync(fileURLToPath(new URL('../../../packages/myact-golden/fixtures/park-areas-small.json', import.meta.url))), 'application/json');
    if (url.origin === ORIGIN) {
      const file = join(DIST, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (existsSync(file)) return send(readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream');
      return send('', 'text/plain', 404);
    }
    if (external && url.hostname !== 'sotaapp2.sotalive.net' && !url.hostname.endsWith('gsi.go.jp')) {
      const e = external({ url: req.url() });
      if (e) {
        externalCalls.push({ method: req.method(), url: req.url(), contentType: req.headers()['content-type'] ?? null, body: req.postData() });
        return send(e.body, 'application/json', e.status);
      }
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
  return { page, context, errors, dialogs, apiCalls, externalCalls };
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

// ---- 山・公園のマーカー(旧版の golden master と比べる) ----
const showMarkers = async (page, [lat, lng], zoom = 13) => {
  await page.evaluate(([la, ln, z]) => window.map.setView([la, ln], z, { animate: false }), [lat, lng, zoom]);
  await page.waitForFunction(() => window.markerLayer.getLayers().length > 0, null, { timeout: 10000 });
  await page.waitForTimeout(300);
};
const markerInfo = (page) =>
  page.evaluate(() => {
    const out = [];
    window.markerLayer.eachLayer((m) => {
      const ll = m.getLatLng();
      const tip = m.getTooltip()?.getContent();
      if (m instanceof L.CircleMarker) out.push({ kind: 'summit', lat: ll.lat, lng: ll.lng, fill: m.options.fillColor, radius: m.getRadius(), tooltip: tip ?? null });
      else out.push({ kind: 'park', lat: ll.lat, lng: ll.lng, color: m.options.icon.options.className.replace('park-marker park-', ''), tooltip: tip });
    });
    return out;
  });
const clickMarker = (page, kind) =>
  page.evaluate((k) => {
    window.markerLayer.eachLayer((m) => {
      if (m.__clicked) return;
      // 旧版の記録は、公園は丹沢大山(JP-0118。緯度 35.4105)をクリックしている
      const target = k === 'summit' ? m instanceof L.CircleMarker : !(m instanceof L.CircleMarker) && Math.abs(m.getLatLng().lat - 35.4105) < 1e-4;
      if (target) { m.__clicked = true; m.fire('click', { latlng: m.getLatLng() }); }
    });
  }, kind);
const goldenColor = (icon) => icon.match(/extra-marker-square-([a-z-]+)/)[1];
const comparable = (name) =>
  expected(name).markers.map((m) => (m.kind === 'park' ? { kind: 'park', lat: m.lat, lng: m.lng, color: goldenColor(m.icon), tooltip: m.tooltip } : m));

for (const [name, point, kind, setup] of [
  ['summit-marker-oyama', POINTS.oyama, 'summit', {}],
  ['park-marker-tanzawa', POINTS.tanzawa, 'park', {}],
  ['park-marker-tanzawa-pota-ref-off', POINTS.tanzawa, 'park', { cookies: { pota_ref: 'false' } }],
  ['park-marker-tanzawa-jaff-ref-off', POINTS.tanzawa, 'park', { cookies: { jaff_ref: 'false' } }],
  ['park-marker-tanzawa-googlemap-mapcode-emulation', POINTS.tanzawa, 'park', { cookies: { link_googlemap: 'true', display_mapcode: 'true' } }],
]) {
  test(`マーカーをクリック(${name}): ポップアップの行が、旧版の記録と同じ`, async () => {
    const { page, context, errors } = await open(setup);
    await showMarkers(page, point);
    await clickMarker(page, kind);
    const lines = await popupLines(page);
    assert.deepEqual(lines, expected(name).popup.text);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

for (const name of ['park-marker-tanzawa', 'park-marker-tanzawa-with-log']) {
  test(`マーカーの色・大きさ・常時表示の文字(${name}): 旧版の記録と同じ`, async () => {
    const { page, context } = await open(name.endsWith('with-log') ? LOGGED : {});
    await showMarkers(page, POINTS.tanzawa);
    const got = await markerInfo(page);
    assert.deepEqual(got.sort((a, b) => a.lat - b.lat), comparable(name).sort((a, b) => a.lat - b.lat));
    await context.close();
  });
}

test('公園名を常時表示しない設定: ツールチップは、マウスを乗せたときだけ(旧版と同じ)', async () => {
  const { page, context } = await open({ cookies: { popup_permanent: 'false' } });
  await showMarkers(page, POINTS.tanzawa);
  assert.equal(await page.locator('.leaflet-tooltip.park-name').count(), 0);
  await context.close();
});

test('公園の詳細: ログがあれば Activations/Attempts と QSOs。log_id が付く', async () => {
  const { page, context, apiCalls } = await open(LOGGED);
  await showMarkers(page, POINTS.tanzawa);
  await clickMarker(page, 'park');
  assert.deepEqual((await popupLines(page)).slice(-2), expected('park-marker-tanzawa-with-log').popup.text.slice(-2));
  assert.ok(apiCalls.some((c) => c.startsWith('GET /search') && c.includes('log_id=hunter-1')), apiCalls.join(' | '));
  assert.ok(apiCalls.some((c) => c.startsWith('GET /pota/parks/search?pota_code=JP-0118') && c.includes('log_id=hunter-1')), apiCalls.join(' | '));
  await context.close();
});

// ---- 検索ボックス ----
const briefState = () => ({
  handlers: [({ path }) => (path.endsWith('/search/brief') ? { status: 200, body: JSON.stringify({ count: 1, candidates: [{ code: 'JP-0118', name: 'Tanzawa', nameJ: '丹沢大山国定公園', lat: 35.4105, lon: 139.2098 }] }) } : null)],
});

test('検索: 打つと候補が出て、候補を選ぶと、その場所へ動く(公園はポップアップなし)', async () => {
  const { page, context, apiCalls, errors } = await open({ state: briefState(), search: '?lat=35.68&lon=139.76&z=9' });
  await page.fill('#ref-search', '丹沢');
  await page.waitForFunction(() => document.querySelectorAll('#ref-list option').length === 1);
  assert.equal(await page.locator('#ref-list option').getAttribute('value'), 'JP-0118 丹沢大山国定公園');
  assert.ok(apiCalls.some((c) => c.startsWith('GET /search/brief?name=')), apiCalls.join(' | '));
  await page.fill('#ref-search', 'JP-0118 丹沢大山国定公園');
  await page.waitForFunction(() => Math.abs(window.map.getCenter().lat - 35.4105) < 1e-3 && window.map.getZoom() === 15);
  assert.equal(await page.inputValue('#ref-search'), '');
  assert.deepEqual(errors, []);
  await context.close();
});

test('検索: 「緯度,経度」を貼り付けると、その場所へ動く', async () => {
  const { page, context } = await open(); // URL の位置を付けない(開いたままのポップアップの自動スクロールと競う)
  await page.fill('#ref-search', '35.410500,139.209800');
  await page.waitForFunction(() => Math.abs(window.map.getCenter().lng - 139.2098) < 1e-3 && window.map.getZoom() === 15);
  await context.close();
});

// ---- ActPaddle(必須。旧版の golden master pemu-* と比べる) ----
const wifiCookies = (extra = {}) => ({ enable_emulation: 'true', enable_wifi: 'true', enable_serial: 'false', pemu_call: 'JA1ABC', pemu_host: 'actpaddle.local', pemu_wpm: '25', ...extra });
const device = (status = 200) => (({ url }) => (url.includes('/play') ? { status, body: '{}' } : null));
const openPaddle = async (page, kind) => {
  await showMarkers(page, kind === 'summit' ? POINTS.oyama : POINTS.tanzawa);
  await clickMarker(page, kind);
  await popupLines(page);
  await page.locator('.leaflet-popup-content button[aria-label="ActPaddle を開く"]').click();
  await page.waitForSelector('#pemuact[open]');
};
const dialogFields = (page) =>
  page.evaluate(() => ({
    name: document.getElementById('pemu_name').innerText,
    values: Object.fromEntries([...document.querySelectorAll('#pemuact input[type=text]')].filter((i) => i.id.startsWith('pemu_') && i.id !== 'pemu_host').map((i) => [i.id, i.value])),
    checks: Object.fromEntries([...document.querySelectorAll('#pemuact input[type=checkbox]')].map((i) => [i.id, i.checked])),
  }));
const sendMesg = async (page, n, edits = {}) => {
  for (const [id, value] of Object.entries(edits)) await page.fill(`#${id}`, value);
  await page.locator('#pemuact button', { hasText: 'SEND' }).nth(n - 1).click();
  await page.waitForTimeout(500);
};
const outputs = (page) => page.evaluate(() => ({ clipboard: window.__clip, serial: window.__serial }));

for (const [name, kind] of [['pemu-open-from-park-popup', 'park'], ['pemu-open-from-summit-popup', 'summit']]) {
  test(`ActPaddle: ポップアップのボタンから開くと、場所の値が入る(${name}): 旧版の記録と同じ`, async () => {
    const { page, context, errors } = await open({ cookies: wifiCookies(), mocks: true });
    await openPaddle(page, kind);
    assert.deepEqual(await dialogFields(page), expected(name).dialog);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('ActPaddle: 設定で有効にしなければ、ボタンは出ない', async () => {
  const { page, context } = await open({ mocks: true });
  await showMarkers(page, POINTS.tanzawa);
  await clickMarker(page, 'park');
  await popupLines(page);
  assert.equal(await page.locator('.leaflet-popup-content button').count(), 0);
  await context.close();
});

for (const [name, setup] of [
  ['pemu-wifi-send-pota-paddle', { kind: 'park', n: 2 }],
  ['pemu-wifi-send-sota-straight-key', { kind: 'summit', n: 1, cookies: { to_paddle: 'false', to_key: 'true' } }],
  ['pemu-wifi-reverse', { kind: 'park', n: 2, cookies: { paddle_reverse: 'true' } }],
  ['pemu-wifi-areacode-added-to-call', { kind: 'park', n: 2, cookies: { include_areacode: 'true' }, edits: { pemu_areacode: '1' } }],
  ['pemu-wifi-areacode-not-added', { kind: 'park', n: 2, cookies: { include_areacode: 'false' }, edits: { pemu_areacode: '1' } }],
]) {
  test(`ActPaddle: WiFi で送る(${name}): クリップボードと POST の中身が旧版の記録と同じ(Content-Type の誤字だけ直す)`, async () => {
    const { page, context, externalCalls } = await open({ cookies: wifiCookies(setup.cookies), mocks: true, external: device() });
    await openPaddle(page, setup.kind);
    await sendMesg(page, setup.n, setup.edits);
    const want = expected(name);
    assert.deepEqual((await outputs(page)).clipboard, want.clipboard);
    assert.deepEqual(externalCalls.map((c) => ({ ...c, contentType: c.contentType === 'application/json' ? 'applicatoin/json' : c.contentType })), want.externalCalls);
    assert.equal(externalCalls[0].contentType, 'application/json');
    await context.close();
  });
}

test('ActPaddle: 同じ記号が何度あっても、すべて置き換える(旧版は最初の 1 つだけ。意図した差分)', async () => {
  const { page, context } = await open({ cookies: wifiCookies(), mocks: true, external: device() });
  await openPaddle(page, 'park');
  await sendMesg(page, 1, { pemu_mesg1: 'CQ DE $CALL $CALL POTA $POTA $POTA $JAFF $JAFF $JCC $JCC' });
  assert.deepEqual((await outputs(page)).clipboard, ['CQ DE JA1ABC JA1ABC POTA JP0118 JP0118 JAFF0050 JAFF0050 JCC 1112 JCC 1112']);
  await context.close();
});

test('ActPaddle: 接続エラーは、alert ではなく、ダイアログの中に出す(旧版は alert。意図した差分)', async () => {
  const { page, context, dialogs } = await open({ cookies: wifiCookies(), mocks: true, external: device(500) });
  await openPaddle(page, 'park');
  await sendMesg(page, 2);
  assert.match(await page.locator('.pemu-status[role=alert]').innerText(), /接続エラー: https:\/\/actpaddle\.local\/play \(Error: Internal Server Error\)/);
  assert.deepEqual(dialogs, []);
  await context.close();
});

test('ActPaddle: USB(Web Serial)に送る: 書く文字列・フィルター・ボーレートが旧版の記録と同じ', async () => {
  const { page, context } = await open({ cookies: wifiCookies({ enable_wifi: 'false', enable_serial: 'true' }), mocks: true });
  await openPaddle(page, 'park');
  await sendMesg(page, 2);
  const want = expected('pemu-serial-send');
  const got = await outputs(page);
  assert.deepEqual(got, { clipboard: want.clipboard, serial: want.serial });
  assert.deepEqual(await page.evaluate(() => window.__serialRequest), want.serialRequest);
  assert.deepEqual(await page.evaluate(() => window.__serialOpen), want.serialOpen);
  await context.close();
});

test('ActPaddle: 送ると、CALL・WPM・送り方を旧版と同じ Cookie に保存する', async () => {
  const { page, context } = await open({ cookies: wifiCookies(), mocks: true, external: device() });
  await openPaddle(page, 'park');
  await sendMesg(page, 1, { pemu_call: 'JH1XYZ', pemu_wpm: '30' });
  const cookies = await cookieMap(context);
  assert.deepEqual([cookies.pemu_call, cookies.pemu_wpm, cookies.enable_wifi, cookies.enable_serial], ['JH1XYZ', '30', 'true', 'false']);
  await context.close();
});

// ---- 公園区域(ポリゴン) ----
const clickArea = async (page, ev) => {
  await page.waitForFunction(() => window.areaLayer.getLayers().length > 0, null, { timeout: 10000 });
  await page.evaluate((e) => window.areaLayer.eachLayer((l) => l.fire(e, { latlng: L.latLng(35.41, 139.21) })), ev);
};
for (const [name, ev] of [['park-area-left-click', 'click'], ['park-area-right-click-debug', 'contextmenu']]) {
  test(`公園区域を${ev === 'click' ? '左' : '右'}クリック(${name}): 旧版の記録と同じ行`, async () => {
    const { page, context, errors } = await open();
    await clickArea(page, ev);
    assert.deepEqual(await popupLines(page), expected(name).popup.text);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('公園区域: 設定で出さないなら、読み込まない(旧版と同じ。display_area)', async () => {
  const { page, context } = await open({ cookies: { display_area: 'false' } });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.areaLayer.getLayers().length), 0);
  assert.equal(await page.evaluate(() => window.map.hasLayer(window.areaLayer)), false);
  await context.close();
});

// ---- スポット(PC は右の側パネル、スマホは下のシート) ----
const iso = (minAgo) => new Date(Date.now() - minAgo * 60_000).toISOString();
const spotsState = () => {
  const calls = [];
  const sp = (program, reference, activator, minAgo, qsos = null) => ({ program, reference, activator, frequency: '7.030', mode: 'CW', comment: 'CQ', spotTime: iso(minAgo), qsos });
  return {
    calls,
    handlers: [
      ({ path, q }) => {
        if (path.endsWith('/activation/spots')) {
          calls.push(q.toString());
          return { status: 200, body: JSON.stringify([
            { key: 'JP-0118', values: [sp('POTA', 'JP-0118', 'JA1XYZ', 50), sp('POTA', 'JP-0118', 'JA1XYZ', 10)] },
            { key: 'JP-1309', values: [sp('POTA', 'JP-1309', 'JH0ABC', 30)] },
            { key: 'JA/KN-006', values: [sp('SOTA', 'JA/KN-006', 'JA3DEF', 20)] },
          ]) };
        }
        if (path.endsWith('/search/brief')) return { status: 200, body: JSON.stringify({ count: 1, candidates: [{ code: q.get('name'), name: 'x', nameJ: 'x', lat: 35.4105, lon: 139.2098 }] }) };
        return null;
      },
    ],
  };
};

test('スポット: ボタンで側パネルが開き、行(新しい順)とチャートの点が出る。SOTA の案内も出る', async () => {
  const state = spotsState();
  const { page, context, errors } = await open({ state });
  await page.click('#spot-button');
  await page.waitForSelector('.spot-row');
  assert.equal(await page.getAttribute('#spot-button', 'aria-expanded'), 'true');
  assert.deepEqual(await page.locator('.spot-row .spot-ref').allInnerTexts(), ['JP-0118', 'JA/KN-006', 'JP-1309']); // 一覧は、最新のスポットが新しい順(10・20・30 分前)
  assert.equal(await page.locator('svg.spot-svg circle').count(), 4);
  assert.equal(await page.locator('#spot-panel .alert-warning').isVisible(), true);
  assert.match(state.calls[0], /pat_ref=%5E%28JA%7CJP-%29/);
  assert.match(state.calls[0], /by_ref=null/);
  assert.match(state.calls[0], /hours_ago=6/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('スポット: プログラム・期間を替えると取り直し、期間は旧版と同じ Cookie(spot_period)に保存する', async () => {
  const state = spotsState();
  const { page, context } = await open({ state });
  await page.click('#spot-button');
  await page.waitForSelector('.spot-row');
  await page.selectOption('#spot-program', 'POTA');
  await page.waitForFunction(() => document.querySelectorAll('.spot-row').length === 2);
  assert.equal(await page.locator('#spot-panel .alert-warning').isVisible(), false);
  await page.selectOption('#spot-period', '12');
  await page.waitForFunction(() => document.cookie.includes('spot_period=12'));
  assert.ok(state.calls.some((c) => c.includes('hours_ago=12')), state.calls.join(' | '));
  await context.close();
});

test('スポット: 行を押すと、その参照の場所へ動く', async () => {
  const { page, context } = await open({ state: spotsState(), search: '?lat=35.68&lon=139.76&z=9' });
  await page.click('#spot-button');
  await page.locator('.spot-row', { hasText: 'JP-1309' }).click();
  await page.waitForFunction(() => Math.abs(window.map.getCenter().lat - 35.4105) < 1e-3 && window.map.getZoom() === 15);
  await context.close();
});

test('スポット: スマホの幅では、下からのシートになり、地図を覆わない閉じた状態から開く', async () => {
  const { page, context } = await open({ state: spotsState() });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator('#spot-panel').isVisible(), false);
  await page.click('#spot-button');
  await page.waitForSelector('.spot-row');
  const box = await page.locator('#spot-panel').boundingBox();
  assert.ok(box.y > 844 * 0.3 && Math.abs(box.y + box.height - 844) < 2, JSON.stringify(box)); // 下に付き、上の約 3 割は地図
  await page.click('button[aria-label="スポットを閉じる"]');
  assert.equal(await page.locator('#spot-panel').isVisible(), false);
  await context.close();
});

// ---- APRS 軌跡・地磁気の指数 ----
const aprsState = (props = {}) => ({
  handlers: [({ path }) => (path.endsWith('/activation/aprs/track')
    ? { status: 200, body: JSON.stringify({ tracks: [{
        properties: { ssid: '7', callsign: 'JA1XYZ-7', lastseen: '2026-10-27T01:00:00Z', distance: 120, summit: 'JA/KN-006', spot_summit: 'JA/KN-006', spot_time: '2026-10-27T00:50:00Z', spot_freq: '7.030', spot_mode: 'CW', spot_comment: '<img src=x onerror=alert(1)>', ...props },
        geometry: { coordinates: [[35.40, 139.20], [35.42, 139.22], [35.44, 139.23]] },
      }] }) }
    : null)],
});

test('時計: 旧版と同じ形(YY/MM/DD HH:mm)に、地磁気の指数(A・K)を添える', async () => {
  const { page, context } = await open();
  await page.waitForFunction(() => /^\d\d\/\d\d\/\d\d \d\d:\d\d A:\d+ K:\d+$/.test(document.getElementById('clock_time').textContent));
  await context.close();
});

test('APRS 軌跡: 線・点・最後の位置のマーカー。ポップアップの文字は、HTML として解釈しない', async () => {
  const { page, context, errors, dialogs } = await open({ state: aprsState() });
  await page.waitForFunction(() => window.aprs.layer?.getLayers().length > 0);
  const counts = await page.evaluate(() => {
    const out = { line: 0, dots: 0, marker: 0 };
    window.aprs.layer.eachLayer((l) => { if (l instanceof L.Polyline && !(l instanceof L.CircleMarker)) out.line++; else if (l instanceof L.CircleMarker) out.dots++; else if (l instanceof L.Marker) out.marker++; });
    return out;
  });
  assert.deepEqual(counts, { line: 1, dots: 3, marker: 1 });
  await page.evaluate(() => window.aprs.layer.eachLayer((l) => { if (!(l instanceof L.Path)) l.openPopup(); }));
  const text = await page.locator('.leaflet-popup-content').innerText();
  assert.match(text, /JA1XYZ-7 \(120m from JA\/KN-006\)/);
  assert.match(text, /7\.030 CW JA\/KN-006/);
  assert.equal(await page.locator('.leaflet-popup-content img').count(), 0);
  assert.deepEqual([errors, dialogs], [[], []]);
  await context.close();
});

test('APRS 軌跡: 設定で出さないなら、取らない(aprs_track)', async () => {
  const { page, context, apiCalls } = await open({ state: aprsState(), cookies: { aprs_track: 'false' } });
  await page.waitForTimeout(600);
  assert.equal(apiCalls.some((c) => c.includes('/activation/aprs/track')), false);
  await context.close();
});
