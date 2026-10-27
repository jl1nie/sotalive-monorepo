// シナリオ: 旧版に対する 1 つの操作と、記録する出力。
// name: expected/<name>.json になる。setup: openLegacy に渡す(cookies・state・gps)。run(page, h): 操作して、出力(オブジェクト)を返す。
// run の戻り値のほかに、sotaapp2 への要求(apiCalls)・alert(dialogs)・ページの例外(errors)・保存された Cookie の一部を、run.mjs が足す。
import { POINTS } from './world.mjs';
import { popup, markers } from './collect.mjs';
import { clickMap, showMarkers, clickMarker, waitAreas, clickArea } from './actions.mjs';
import { potalogScenarios } from './scenarios-potalog.mjs';
import { paddleScenarios } from './scenarios-paddle.mjs';

/** POTA ログのある状態(Hunter のログ hunter-1。JP-0118 を 2 回活動・3 回試行・QSO 40) */
export const LOGGED = {
  cookies: { show_potalog: 'true', show_potaactlog: 'false', pota_hunter_uuid: 'hunter-1' },
  state: {
    handlers: [({ path, method }) => (method === 'GET' && path.endsWith('/pota/log/hunter-1') ? { status: 200, body: JSON.stringify({ logId: 'hunter-1', lastUpdate: '2026-08-01' }) } : null)],
    parkLog: {
      'hunter-1': {
        parkSearch: { activations: 2, attempts: 3, qsos: 40 },
        search: { act: 2, atmpt: 3, qsos: 40, date: '2026-08-01' },
      },
    },
  },
};

const near = ([lat, lng], d) => [lat + d, lng + d];

export const popupScenarios = [
  // ---- 地図の空白をクリック ----
  { name: 'blank-tokyo', run: async (page) => (await clickMap(page, POINTS.tokyo), { popup: await popup(page) }) },
  { name: 'blank-near-summit-oyama', run: async (page) => (await clickMap(page, near(POINTS.oyama, 0.0005)), { popup: await popup(page) }) },
  { name: 'blank-summit-fuji-outside', run: async (page) => (await clickMap(page, POINTS.fuji), { popup: await popup(page) }) },
  { name: 'blank-sea-outside', run: async (page) => (await clickMap(page, POINTS.sea), { popup: await popup(page) }) },
  {
    name: 'blank-tokyo-googlemap-mapcode',
    setup: { cookies: { link_googlemap: 'true', display_mapcode: 'true' } },
    run: async (page) => (await clickMap(page, POINTS.tokyo), { popup: await popup(page) }),
  },

  // ---- マーカー ----
  {
    name: 'summit-marker-oyama',
    run: async (page) => {
      const m = await showMarkers(page, POINTS.oyama);
      await clickMarker(page, 'summit');
      return { markers: m, popup: await popup(page) };
    },
  },
  {
    name: 'park-marker-tanzawa',
    run: async (page) => {
      const m = await showMarkers(page, POINTS.tanzawa);
      await clickMarker(page, 'park');
      return { markers: m, popup: await popup(page) };
    },
  },
  {
    name: 'park-marker-tanzawa-with-log',
    setup: LOGGED,
    run: async (page) => {
      const m = await showMarkers(page, POINTS.tanzawa);
      await clickMarker(page, 'park');
      return { markers: m, popup: await popup(page) };
    },
  },
  {
    name: 'park-marker-tanzawa-pota-ref-off',
    setup: { cookies: { pota_ref: 'false' } },
    run: async (page) => (await showMarkers(page, POINTS.tanzawa), await clickMarker(page, 'park'), { popup: await popup(page) }),
  },
  {
    name: 'park-marker-tanzawa-jaff-ref-off',
    setup: { cookies: { jaff_ref: 'false' } },
    run: async (page) => (await showMarkers(page, POINTS.tanzawa), await clickMarker(page, 'park'), { popup: await popup(page) }),
  },
  {
    name: 'park-marker-tanzawa-googlemap-mapcode-emulation',
    setup: { cookies: { link_googlemap: 'true', display_mapcode: 'true', enable_emulation: 'true' } },
    run: async (page) => (await showMarkers(page, POINTS.tanzawa), await clickMarker(page, 'park'), { popup: await popup(page) }),
  },
  {
    name: 'park-marker-tanzawa-names-not-permanent',
    setup: { cookies: { popup_permanent: 'false' } },
    run: async (page) => ({ markers: await showMarkers(page, POINTS.tanzawa) }),
  },

  // ---- 公園区域(ポリゴン) ----
  {
    name: 'park-area-left-click',
    run: async (page) => {
      await waitAreas(page);
      await clickArea(page, [35.41, 139.21]);
      return { popup: await popup(page) };
    },
  },
  {
    name: 'park-area-right-click-debug',
    run: async (page) => {
      await waitAreas(page);
      await clickArea(page, [35.41, 139.21], 'contextmenu');
      return { popup: await popup(page) };
    },
  },

  // ---- 現在地(GPS)。起動のとき、現在地が取れたとして、ポップアップが出る ----
  {
    name: 'gps-tokyo',
    setup: { gps: { latitude: POINTS.tokyo[0], longitude: POINTS.tokyo[1] } },
    run: async (page) => ({ popup: await popup(page), center: await page.evaluate(() => ({ ...map.getCenter(), zoom: map.getZoom() })) }),
  },
];

export const scenarios = [...popupScenarios, ...potalogScenarios, ...paddleScenarios];

export { markers };
