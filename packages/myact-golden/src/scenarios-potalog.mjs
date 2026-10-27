// POTA ログ(設定画面の管理・地図への反映)。ログは sotaapp2 に UUID で保存される(ログインなし)。
// 旧版の potaLog(command)(myact.js)を、画面の操作と同じ入口(関数)で呼び、画面の状態・Cookie・API の呼び出しを記録する。
import { popup } from './collect.mjs';
import { showMarkers, clickMarker } from './actions.mjs';

/** sotaapp2 のログの API の、小さな模擬。logs: { id: 最終更新 }。アップロードは、ファイル名で結果を変える(bad → 不正な形式、activator を含む → Activator のログ) */
export function logServer(initial = {}) {
  const logs = { ...initial };
  const json = (body, status = 200) => ({ status, body: JSON.stringify(body) });
  return [
    ({ path, method }) => {
      const share = /^\/api\/v2\/pota\/log-share\/([^/]+)$/.exec(path);
      if (share && method === 'GET') return share[1] === 'ABC123' ? json({ activator_logid: 'act-1', hunter_logid: 'hunt-1' }) : json({}, 404);
      if (/^\/api\/v2\/pota\/log-share\/[^/]+\/[^/]+$/.test(path) && method === 'GET') return json({ share_id: 'ABC123' });
      const one = /^\/api\/v2\/pota\/log\/([^/]+)$/.exec(path);
      if (one && method === 'GET') return logs[one[1]] ? json({ logId: one[1], lastUpdate: logs[one[1]] }) : json({}, 404);
      if (one && method === 'DELETE') return logs[one[1]] ? (delete logs[one[1]], json({})) : json({}, 404);
      return null;
    },
    ({ path, method, body }) => {
      if (method !== 'POST' || !/^\/api\/v2\/pota\/log\/[^/]+\/[^/]+$/.test(path)) return null;
      const name = /filename="([^"]*)"/.exec(body ?? '')?.[1] ?? '';
      if (name.includes('bad')) return json({}, 400);
      const kind = name.includes('activator') ? 'activator' : 'hunter';
      const id = kind === 'activator' ? 'act-new' : 'hunt-new';
      logs[id] = '2026-10-01';
      return json({ logKind: kind, logId: id });
    },
  ];
}

const settle = (page) => page.waitForTimeout(500);
const call = async (page, command) => (await page.evaluate((c) => potaLog(c), command), settle(page));
const saveCookies = async (page) => (await page.evaluate(() => clickPrefs()), settle(page)); // 設定を閉じたとき(Cookie に保存する)

/** 設定画面の、POTA ログの欄の状態 */
export const potaUi = (page) =>
  page.evaluate(() => ({
    activator: document.getElementById('pota_activator_uuid').innerText,
    hunter: document.getElementById('pota_hunter_uuid').innerText,
    exportKey: document.getElementById('pota_export_key').innerText,
    showPotalog: document.getElementById('show_potalog').checked,
    radioActivator: document.getElementById('show_potaactlog').checked,
    radioHunter: document.getElementById('show_potaactlog2').checked,
    prefs: { activator: prefs.pota_activator_uuid, hunter: prefs.pota_hunter_uuid, show: prefs.show_potalog, activatorLog: prefs.show_potaactlog },
    logIdUsed: getLogID(),
  }));

const csv = (name) => ({ name, mimeType: 'text/csv', buffer: Buffer.from('Reference,Name\nJP-0118,Tanzawa\n') });
const LOGS = { 'act-1': '2026-09-01', 'hunt-1': '2026-08-01' };
// 実行ごとに作る(消したログを、次のシナリオに引き継がない)
const both = () => ({ cookies: { pota_activator_uuid: 'act-1', pota_hunter_uuid: 'hunt-1', show_potalog: 'true', show_potaactlog: 'true' }, state: { handlers: logServer(LOGS) } });
const none = () => ({ state: { handlers: logServer() } });
const serverOnly = () => ({ state: { handlers: logServer(LOGS) } }); // Cookie はなく、サーバーにログがある(IMPORT 用)

export const potalogScenarios = [
  { name: 'potalog-check-both-valid', setup: both, run: async (page) => ({ ui: await potaUi(page) }) },
  {
    name: 'potalog-check-invalid-uuid',
    setup: () => ({ cookies: { pota_hunter_uuid: 'gone' }, state: { handlers: logServer() } }),
    run: async (page) => ({ ui: await potaUi(page) }),
  },
  {
    name: 'potalog-upload-activator',
    setup: none,
    run: async (page) => {
      await page.setInputFiles('#file_input', csv('activator.csv'));
      await call(page, 'upload');
      await saveCookies(page);
      return { ui: await potaUi(page) };
    },
  },
  {
    name: 'potalog-upload-hunter',
    setup: none,
    run: async (page) => {
      await page.setInputFiles('#file_input', csv('hunter.csv'));
      await call(page, 'upload');
      await saveCookies(page);
      return { ui: await potaUi(page) };
    },
  },
  {
    name: 'potalog-upload-invalid-file',
    setup: none,
    run: async (page) => {
      await page.setInputFiles('#file_input', csv('bad.csv'));
      await call(page, 'upload');
      return { ui: await potaUi(page) };
    },
  },
  { name: 'potalog-upload-no-file', setup: none, run: async (page) => (await call(page, 'upload'), { ui: await potaUi(page) }) },
  {
    name: 'potalog-delete-activator',
    setup: both,
    run: async (page) => (await call(page, 'del-act'), await saveCookies(page), { ui: await potaUi(page) }),
  },
  {
    name: 'potalog-delete-hunter',
    setup: both,
    run: async (page) => (await call(page, 'del-hunt'), await saveCookies(page), { ui: await potaUi(page) }),
  },
  { name: 'potalog-export-share-key', setup: both, run: async (page) => (await call(page, 'export'), { ui: await potaUi(page) }) },
  {
    name: 'potalog-import-ok',
    setup: serverOnly,
    run: async (page) => {
      await page.evaluate(() => { document.getElementById('import_uuid').value = 'ABC123'; });
      await call(page, 'import');
      await saveCookies(page);
      return { ui: await potaUi(page) };
    },
  },
  {
    name: 'potalog-import-not-found',
    setup: none,
    run: async (page) => (await page.evaluate(() => { document.getElementById('import_uuid').value = 'ZZZ999'; }), await call(page, 'import'), { ui: await potaUi(page) }),
  },
  {
    name: 'potalog-switch-activator-hunter',
    setup: both,
    run: async (page) => {
      await call(page, 'show-hunt');
      const hunter = await potaUi(page);
      await call(page, 'show-act');
      return { hunter, activator: await potaUi(page) };
    },
  },
  {
    // 表示を Activator にすると、地図の取得に Activator のログ ID が付く
    name: 'potalog-activator-log-id-on-map',
    setup: () => {
      const b = both();
      return { ...b, state: { ...b.state, parkLog: { 'act-1': { parkSearch: { activations: 5, attempts: 5, qsos: 120 }, search: { act: 5, atmpt: 5, qsos: 120, date: '2026-09-01' } } } } };
    },
    run: async (page) => {
      const m = await showMarkers(page, [35.4105, 139.2098]);
      await clickMarker(page, 'park');
      return { markers: m, popup: await popup(page) };
    },
  },
  {
    name: 'potalog-stats',
    setup: { state: { handlers: [({ path }) => (path.endsWith('/pota/log-stat') ? { status: 200, body: JSON.stringify({ log_history: [{ time: '2026-10-25T00:00:00Z', users: 10, logs: 1000 }, { time: '2026-10-26T00:00:00Z', users: 12, logs: 1300 }, { time: '2026-10-27T00:00:00Z', users: 15, logs: 1800 }] }) } : null)] } },
    run: async (page) => {
      await page.evaluate(() => $('#logs-data').modal('show'));
      await page.waitForFunction(() => typeof chart2 !== 'undefined' && chart2 && chart2.data.labels.length > 0, null, { timeout: 8000 });
      return { chart: await page.evaluate(() => ({ labels: chart2.data.labels.map((d) => d.toISOString()), datasets: chart2.data.datasets.map((d) => ({ label: d.label, type: d.type, data: d.data })) })) };
    },
  },
];
