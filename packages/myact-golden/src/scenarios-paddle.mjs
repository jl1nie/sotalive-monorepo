// パドルエミュレータ(ActPaddle)。ポップアップのクリップボードのボタン → モーダル → SEND。
// WiFi: https://<host>/play に POST(JSON + CR)。USB: Web Serial(115200bps)に書く。どちらも、メッセージをクリップボードにコピーする。
// 旧版の「最初の 1 つしか置き換えない」(String.replace)・Content-Type の誤字(applicatoin/json)も、そのまま記録する(新版の差分は intentional-diffs.md)。
import { showMarkers, clickMarker } from './actions.mjs';
import { popup } from './collect.mjs';

/** クリップボードと Web Serial の差し替え。書かれたものは window.__clip・window.__serial に残る */
export function installMocks() {
  window.__clip = [];
  window.__serial = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__clip.push(t); } }, configurable: true });
  Object.defineProperty(navigator, 'serial', {
    value: {
      requestPort: async (opts) => {
        window.__serialRequest = opts;
        return {
          open: async (o) => { window.__serialOpen = o; },
          writable: new WritableStream({ write(chunk) { window.__serial.push(new TextDecoder().decode(chunk)); } }),
          readable: { getReader: () => ({ read: async () => ({ value: new TextEncoder().encode('OK\r'), done: false }) }) },
        };
      },
    },
    configurable: true,
  });
}

// 送り方(WiFi か USB)と、パドルかストレートキーかは、それぞれ**ラジオボタンの組**(name が同じ)。
// 旧版の既定は、組の両方が true で、あとの方(enable_serial・to_key ではなく to_paddle)が選ばれるので、組の両方を指定する。
const wifi = (extra = {}) => ({
  cookies: { enable_emulation: 'true', enable_wifi: 'true', enable_serial: 'false', pemu_call: 'JA1ABC', pemu_host: 'actpaddle.local', pemu_wpm: '25', ...extra },
});
const device = (status = 200) => ({ external: ({ url }) => (url.includes('/play') ? { status, body: '{}' } : null) });

/** 山または公園のポップアップのボタンから、ダイアログを開く */
async function openFromPopup(page, kind) {
  await showMarkers(page, kind === 'summit' ? [35.4408, 139.2312] : [35.4105, 139.2098]);
  await clickMarker(page, kind);
  await popup(page);
  await page.locator('.leaflet-popup-content button').click();
  await page.waitForSelector('#pemuact.show', { timeout: 5000 });
  await page.waitForTimeout(300);
}

const fields = (page) =>
  page.evaluate(() => ({
    name: document.getElementById('pemu_name').innerText,
    values: Object.fromEntries([...document.querySelectorAll('#pemuact input[type=text]')].map((i) => [i.id, i.value])),
    checks: Object.fromEntries([...document.querySelectorAll('#pemuact input[type=checkbox]')].map((i) => [i.id, i.checked])),
  }));

async function send(page, n, edits = {}) {
  for (const [id, value] of Object.entries(edits)) await page.fill(`#${id}`, value);
  await page.locator('#pemuact button', { hasText: 'SEND' }).nth(n - 1).click();
  await page.waitForTimeout(600);
}

const out = async (page) => ({ clipboard: await page.evaluate(() => window.__clip), serial: await page.evaluate(() => window.__serial) });

export const paddleScenarios = [
  { name: 'pemu-open-from-park-popup', setup: { ...wifi(), initScript: installMocks }, run: async (page) => (await openFromPopup(page, 'park'), { dialog: await fields(page) }) },
  { name: 'pemu-open-from-summit-popup', setup: { ...wifi(), initScript: installMocks }, run: async (page) => (await openFromPopup(page, 'summit'), { dialog: await fields(page) }) },
  {
    name: 'pemu-wifi-send-pota-paddle',
    setup: { ...wifi(), state: device(), initScript: installMocks },
    run: async (page) => (await openFromPopup(page, 'park'), await send(page, 2), await out(page)),
  },
  {
    name: 'pemu-wifi-send-sota-straight-key',
    setup: { ...wifi({ to_paddle: 'false', to_key: 'true' }), state: device(), initScript: installMocks },
    run: async (page) => (await openFromPopup(page, 'summit'), await send(page, 1), await out(page)),
  },
  {
    name: 'pemu-wifi-reverse',
    setup: { ...wifi({ paddle_reverse: 'true' }), state: device(), initScript: installMocks },
    run: async (page) => (await openFromPopup(page, 'park'), await send(page, 2), await out(page)),
  },
  {
    name: 'pemu-wifi-areacode-added-to-call',
    setup: { ...wifi({ include_areacode: 'true' }), state: device(), initScript: installMocks },
    run: async (page) => (await openFromPopup(page, 'park'), await send(page, 2, { pemu_areacode: '1' }), await out(page)),
  },
  {
    name: 'pemu-wifi-areacode-not-added',
    setup: { ...wifi({ include_areacode: 'false' }), state: device(), initScript: installMocks },
    run: async (page) => (await openFromPopup(page, 'park'), await send(page, 2, { pemu_areacode: '1' }), await out(page)),
  },
  {
    // 旧版は、$CALL などを、最初の 1 つしか置き換えない(新版は、すべて置き換える。intentional-diffs.md)
    name: 'pemu-wifi-repeated-tokens-first-only',
    setup: { ...wifi(), state: device(), initScript: installMocks },
    run: async (page) => (await openFromPopup(page, 'park'), await send(page, 1, { pemu_mesg1: 'CQ DE $CALL $CALL POTA $POTA $POTA $JAFF $JAFF $JCC $JCC' }), await out(page)),
  },
  {
    name: 'pemu-wifi-connection-error',
    setup: { ...wifi(), state: device(500), initScript: installMocks },
    run: async (page) => (await openFromPopup(page, 'park'), await send(page, 2), await out(page)),
  },
  {
    name: 'pemu-serial-send',
    setup: { ...wifi({ enable_wifi: 'false', enable_serial: 'true' }), initScript: installMocks },
    run: async (page) => {
      await openFromPopup(page, 'park');
      await send(page, 2);
      return { ...(await out(page)), serialRequest: await page.evaluate(() => window.__serialRequest), serialOpen: await page.evaluate(() => window.__serialOpen) };
    },
  },
];
