// 本物の sotaapp2・国土地理院の応答を、読み取り(GET)で 1 回だけ記録して、fixtures/ に JSON で保存する。
//   node tools/record-fixtures.mjs
// 保存したあとは、旧版・新版とも、この固定の応答だけを読む(本物の API には出ない)ので、結果は決まったものになる。
// 本物の応答が変わっても、記録し直さない限り、テストは変わらない。
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://sotaapp2.sotalive.net/api/v2';
const OUT = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** 地点。名前 → [緯度, 経度] */
export const POINTS = {
  tokyo: [35.681236, 139.767125], // 東京駅のあたり(圏内・山なし)
  oyama: [35.4408, 139.2312], // 大山(SOTA JA/KN-001 ではなく JA/KN-006。圏内で、自治体あり)
  tanzawa: [35.4105, 139.2098], // 丹沢大山国定公園のマーカー(POTA JP-0118)
  fuji: [35.3606, 138.7274], // 富士山剣ヶ峰(SOTA JA/SO-001。国土地理院に住所がなく、圏外になる山)
  sea: [30, 150], // 海の上(圏外)
};

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
const save = (name, data) => writeFileSync(OUT + name, JSON.stringify(data, null, 2) + '\n');

for (const [name, [lat, lon]] of Object.entries(POINTS)) {
  const addr = await get(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`);
  save(`gsi-address-${name}.json`, addr);
  save(`gsi-elevation-${name}.json`, await get(`https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lat=${lat}&lon=${lon}&outtype=JSON`));
  const muni = addr?.results?.muniCd ? `&muni_code=${addr.results.muniCd}` : '';
  const jcc = await fetch(`${API}/locator/jcc-jcg?lat=${lat}&lon=${lon}${muni}`);
  save(`jcc-${name}.json`, jcc.ok ? await jcc.json() : { __status: jcc.status });
}
save('sota-summit-oyama.json', await get(`${API}/sota/summits/search?lat=${POINTS.oyama[0]}&lon=${POINTS.oyama[1]}&dist=200`));
save('sota-summit-fuji.json', await get(`${API}/sota/summits/search?lat=${POINTS.fuji[0]}&lon=${POINTS.fuji[1]}&dist=200`));
save('pota-park-jp0118.json', await get(`${API}/pota/parks/search?pota_code=JP-0118`));
save('search-oyama.json', await get(`${API}/search?min_lat=35.38&min_lon=139.17&max_lat=35.47&max_lon=139.26&min_elev=0&min_area=0`));
save('geomag.json', await get(`${API}/propagation/geomag`));
console.log('記録した: ' + OUT);
