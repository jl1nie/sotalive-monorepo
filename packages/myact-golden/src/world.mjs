// 固定の応答で作った「世界」: 旧版・新版が呼ぶ API(sotaapp2・国土地理院)に、fixtures/ の記録で答える。
// 本物の API には出ない。応答は、URL(パスと主なパラメーター)で決まる。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIX = fileURLToPath(new URL('../fixtures/', import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(FIX + name, 'utf8'));

/** tools/record-fixtures.mjs の POINTS と同じ(名前 → [緯度, 経度]) */
export const POINTS = {
  tokyo: [35.681236, 139.767125],
  oyama: [35.4408, 139.2312],
  tanzawa: [35.4105, 139.2098],
  fuji: [35.3606, 138.7274],
  sea: [30, 150],
};

/** 座標に近い地点の名前(0.02° 以内)。なければ null */
export function nearestPoint(lat, lon, tolerance = 0.02) {
  for (const [name, [la, lo]] of Object.entries(POINTS)) {
    if (Math.abs(la - lat) <= tolerance && Math.abs(lo - lon) <= tolerance) return name;
  }
  return null;
}

/**
 * 1 つの要求に答える。`state` はシナリオが持つ状態(POTA ログなど)。答えがなければ null(404)。
 * 戻り値: { status, body }
 */
export function respond(urlString, method, body, state = {}) {
  const url = new URL(urlString);
  const q = url.searchParams;
  const path = url.pathname;
  const ok = (json, status = 200) => ({ status, body: JSON.stringify(json) });
  const lat = Number(q.get('lat'));
  const lon = Number(q.get('lon'));

  // シナリオが、先に答える(POTA ログの操作など)
  for (const handler of state.handlers ?? []) {
    const r = handler({ url, method, body, path, q });
    if (r) return r;
  }

  if (url.hostname === 'mreversegeocoder.gsi.go.jp') {
    const name = nearestPoint(lat, lon);
    return ok(name ? fixture(`gsi-address-${name}.json`) : {});
  }
  if (url.hostname === 'cyberjapandata2.gsi.go.jp' && path.endsWith('getelevation.php')) {
    const name = nearestPoint(lat, lon);
    return ok(name ? fixture(`gsi-elevation-${name}.json`) : { elevation: '-----' });
  }
  if (!path.startsWith('/api/v2/')) return null;
  const api = path.slice('/api/v2'.length);

  if (api === '/locator/jcc-jcg') {
    const name = nearestPoint(lat, lon);
    const data = name ? fixture(`jcc-${name}.json`) : { __status: 404 };
    return data.__status ? ok({}, data.__status) : ok(data);
  }
  if (api === '/sota/summits/search') {
    for (const name of ['oyama', 'fuji']) {
      if (nearestPoint(lat, lon, 0.003) === name) return ok(fixture(`sota-summit-${name}.json`));
    }
    return ok([]);
  }
  if (api === '/pota/parks/search') {
    if (q.get('pota_code') !== 'JP-0118') return ok([]);
    const parks = fixture('pota-park-jp0118.json');
    const log = state.parkLog?.[q.get('log_id')];
    return ok(log ? parks.map((p) => ({ ...p, ...log.parkSearch })) : parks);
  }
  if (api === '/search') {
    const inBox = Number(q.get('min_lat')) <= 35.4408 && Number(q.get('max_lat')) >= 35.4408 && Number(q.get('min_lon')) <= 139.2312 && Number(q.get('max_lon')) >= 139.2312;
    if (!inBox) return ok({ sota: [], pota: [], temples: [] });
    const data = fixture('search-oyama.json');
    const log = state.parkLog?.[q.get('log_id')];
    if (log) data.pota = data.pota.map((p) => (p.pota === 'JP-0118' ? { ...p, ...log.search } : p));
    return ok(data);
  }
  if (api === '/propagation/geomag') return ok(fixture('geomag.json'));
  if (api === '/activation/aprs/track') return ok({ tracks: [] });
  if (api === '/activation/spots') return ok([]);
  return null;
}
