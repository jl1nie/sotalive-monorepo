// 旧版 MyACT(apps/myact-org/index.html + packages/shared/common)を、固定の応答で開く。
// packages/shared/tests/legacy.e2e.mjs の openApp と同じ作り(ORIGIN を差し替えた配信)。あちらは、旧版の最低限のテストなので、別に持つ。
// ネットワークのない手元では、LEGACY_CDN_DIR に `ホスト名/パス` の形で CDN のファイルを置くと、そこから読む。
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { respond } from './world.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const COMMON = join(ROOT, 'packages/shared/common');
const FIXTURES = join(ROOT, 'packages/myact-golden/fixtures');
export const ORIGIN = 'https://legacy.test';

/**
 * 記録する要求の URL を、OS による揺れが出ないようにする。地図の範囲(`/search` の min_lat・min_lon・max_lat・max_lon)は、
 * 画面の大きさ(Linux と macOS で、1 ピクセルほど違う)で、小数の下の桁が変わるので、小数第 1 位に丸める。クリックした座標などは、丸めない。
 */
export function normalizeCall(call) {
  return call.replace(/\b(min|max)_(lat|lon)=(-?[\d.]+)/g, (_m, mm, ll, v) => `${mm}_${ll}=${Number(v).toFixed(1)}`);
}
const CDN = ['unpkg.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

/** multipart の本文は、境界の文字列が毎回違うので、アップロードしたファイル名だけを記録する */
function multipartNote(body) {
  const m = body && /filename="([^"]*)"/.exec(body);
  return m ? ` [multipart: ${m[1]}]` : '';
}

let browser;
export async function launch() {
  browser = await chromium.launch();
  return browser;
}
export async function close() {
  await browser?.close();
}

/**
 * 旧版を開く。
 * - cookies: 設定(旧版の Cookie 名と値。例 { pota_ref: 'false' })
 * - state: respond() に渡す状態(POTA ログの応答など)
 * - gps: { latitude, longitude } なら、現在地をすぐ返す。なければ、取得が保留のまま(コールバックが呼ばれない)
 * - initScript: ページより先に走らせる関数(クリップボード・Web Serial の差し替えなど)
 * - state.external: ({ url, method, headers, body }) => { status, body, headers } | null。sotaapp2・国土地理院以外(パドルの機器など)への要求に答える。要求は externalCalls に残る
 * 戻り値: { page, context, dialogs, errors, apiCalls, resetCalls() }。apiCalls は sotaapp2 への要求(メソッド・パス・クエリ)
 */
export async function openLegacy({ cookies = {}, state = {}, gps, initScript } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await context.addCookies(Object.entries(cookies).map(([name, value]) => ({ name, value: String(value), url: ORIGIN })));
  const page = await context.newPage();
  const dialogs = [];
  const errors = [];
  let apiCalls = [];
  const externalCalls = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    d.dismiss();
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((g) => {
    navigator.geolocation.getCurrentPosition = (ok) => {
      if (g) setTimeout(() => ok({ coords: { latitude: g.latitude, longitude: g.longitude, altitude: null } }), 0);
    };
  }, gps ?? null);
  if (initScript) await page.addInitScript(initScript);
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const send = (body, type, status = 200) => route.fulfill({ status, contentType: type, body });
    if (url.origin === ORIGIN) {
      if (url.pathname === '/') return send(readFileSync(join(ROOT, 'apps/myact-org/index.html')), 'text/html');
      // 公園区域は、1 区域だけの小さなもの(本物は 14MB)
      if (url.pathname.startsWith('/json/jaffpota-annotated-v')) return send(readFileSync(join(FIXTURES, 'park-areas-small.json')), 'application/json');
      const file = join(COMMON, decodeURIComponent(url.pathname));
      if (existsSync(file)) return send(readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream');
      return send('', 'text/plain', 404);
    }
    if (state.external && url.hostname !== 'sotaapp2.sotalive.net' && !url.hostname.endsWith('gsi.go.jp')) {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' }); // 事前確認(preflight)
      const e = state.external({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() });
      if (e) {
        externalCalls.push({ method: req.method(), url: req.url(), contentType: req.headers()['content-type'] ?? null, body: req.postData() });
        return route.fulfill({ status: e.status ?? 200, headers: { ...cors, 'content-type': 'application/json' }, body: e.body ?? '{}' });
      }
    }
    const r = respond(req.url(), req.method(), req.postData(), state);
    if (r) {
      if (url.hostname === 'sotaapp2.sotalive.net') apiCalls.push(normalizeCall(`${req.method()} ${url.pathname.replace('/api/v2', '')}${url.search}`) + multipartNote(req.postData()));
      return send(r.body, 'application/json', r.status);
    }
    if (url.hostname === 'sotaapp2.sotalive.net') {
      apiCalls.push(normalizeCall(`${req.method()} ${url.pathname.replace('/api/v2', '')}${url.search}`) + multipartNote(req.postData()) + ' (答えなし: 404)');
      return send('{}', 'application/json', 404);
    }
    if (CDN.includes(url.hostname)) {
      const mirror = process.env.LEGACY_CDN_DIR && join(process.env.LEGACY_CDN_DIR, url.hostname, url.pathname);
      if (mirror && existsSync(mirror)) return send(readFileSync(mirror), TYPES[extname(mirror)] ?? 'text/plain');
      return route.continue();
    }
    if (['image', 'font', 'media'].includes(req.resourceType())) return route.fulfill({ status: 204, body: '' });
    return route.abort();
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => typeof window.map === 'object' && typeof window.displayPopup === 'function', null, { timeout: 20000 });
  await page.waitForTimeout(500); // 起動の読み込み(地磁気・APRS など)を待つ
  return { page, context, dialogs, errors, externalCalls, get apiCalls() { return apiCalls; }, resetCalls: () => { apiCalls = []; externalCalls.length = 0; } };
}
