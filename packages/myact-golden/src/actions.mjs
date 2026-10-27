// 旧版の画面での操作。旧版のグローバル(map・L・show_summit_marker・geojson・userChange)を使う。
import { markers } from './collect.mjs';

export const clickMap = (page, [lat, lng]) => page.evaluate(([la, ln]) => map.fire('click', { latlng: L.latLng(la, ln) }), [lat, lng]);

/** 利用者が地図を動かした扱いにして、その位置のマーカーを出す(旧版は、利用者の操作のときだけ、マーカーを取り直す) */
export async function showMarkers(page, [lat, lng], zoom = 13) {
  await page.evaluate(([la, ln, z]) => { userChange = true; map.setView([la, ln], z); }, [lat, lng, zoom]);
  await page.waitForFunction(() => show_summit_marker.length > 0, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  return markers(page);
}

/** kind('summit' か 'park')の最初のマーカーをクリックする */
export const clickMarker = (page, kind) =>
  page.evaluate((k) => {
    const m = show_summit_marker.find((x) => (k === 'summit') === (x instanceof L.CircleMarker));
    m.fire('click', { latlng: m.getLatLng() });
  }, kind);

/** 公園区域のレイヤーが読み込まれるのを待つ */
export const waitAreas = (page) => page.waitForFunction(() => typeof geojson !== 'undefined' && geojson.getLayers().length > 0, null, { timeout: 10000 });

export const clickArea = (page, [lat, lng], event = 'click') =>
  page.evaluate(([la, ln, ev]) => geojson.eachLayer((l) => l.fire(ev, { latlng: L.latLng(la, ln) })), [lat, lng, event]);
