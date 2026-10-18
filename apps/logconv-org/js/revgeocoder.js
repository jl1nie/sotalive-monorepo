const endpoint = {
	'revgeocode': 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress',
	'revyahoo': 'https://www.sotalive.net/api/reverse-geocoder/LonLatToAddressMapCode',
	'elevation': 'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php',
	'muni': 'https://sotaapp2.sotalive.net/api/v2/locator/jcc-jcg',
	'mapcode': 'https://japanmapcode.com/mapcode'
};

const cache_rev = new Map();

var use_yahoo_revgeocode = false;
var enable_gsi_elevation = true;

async function get_mapcode(lat, lng) {
	const data = { lng: lng, lat: lat };
	const url = endpoint['mapcode'];
	try {
		const response = await fetch(url,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
		if (!response.ok) { throw new Error('Network response was not ok'); }
		const result = await response.json();
		return result.mapcode;
	} catch (error) {
		console.error('Error:', error);
		return null;
	}
}

async function local_reverse_geocoder(lat, lng, elev) {
	if (use_yahoo_revgeocode)
		return local_reverse_geocoder_yahoo(lat, lng, elev)
	else
		return local_reverse_geocoder_gsi(lat, lng, elev)

}

async function local_reverse_geocoder_gsi(lat, lng, elev) {
	const pos = `?lat=${lat}&lon=${lng}`;

	// キャッシュチェック
	if (cache_rev.has(pos)) {
		return cache_rev.get(pos);
	}

	// キャッシュ整理
	if (cache_rev.size >= 16) {
		const oldest = cache_rev.keys().next().value;
		cache_rev.delete(oldest);
	}

	// 高度取得は並列処理
	const elev_promise = elev ? local_get_elevation(lat, lng) : Promise.resolve(null);

	try {
		// 逆ジオコーディング
		const rev_result = await fetch(`${endpoint.revgeocode}${pos}`).then(res => res.json());

		// 自治体コード取得
		const muni_code = rev_result?.results?.muniCd ? `&muni_code=${rev_result.results.muniCd}` : '';
		const result = await fetch(`${endpoint.muni}${pos}${muni_code}`).then(res => res.json());

		if (!result.muniCode) {
			const err = {
				errors: 'OUTSIDE_JA',
				maidenhead: result.maidenhead
			};
			cache_rev.set(pos, Promise.resolve(err));
			return err;
		}

		// 地名追加
		if (rev_result?.results?.lv01Nm !== "−") {
			result.municipality += rev_result.results.lv01Nm;
		}

		result.errors = 'OK';

		// 高度情報追加
		if (elev) {
			const elevResult = await elev_promise;
			result.elevation = elevResult.elevation;
			result.hsrc = elevResult.hsrc;

			if (elevResult.elevation === '-----') {
				result.errors = 'OUTSIDE_JA';
			}
		}

		cache_rev.set(pos, Promise.resolve(result));
		return result;

	} catch (error) {
		console.error("Error in local_reverse_geocoder_gsi:", error);
		const err = {
			errors: 'ERROR',
			maidenhead: null
		};
		cache_rev.set(pos, Promise.resolve(err));
		return err;
	}
}

async function local_reverse_geocoder_yahoo(lat, lng, elev) {
	const pos = `?lat=${lat}&lon=${lng}`;

	// キャッシュチェック
	if (cache_rev.has(pos)) {
		return cache_rev.get(pos);
	}

	// キャッシュ整理
	if (cache_rev.size >= 16) {
		const oldest = cache_rev.keys().next().value;
		cache_rev.delete(oldest);
	}

	// 高度取得は並列処理
	const elev_promise = elev && enable_gsi_elevation ? local_get_elevation(lat, lng) : Promise.resolve(null);

	try {
		// 逆ジオコーディング
		const result = await fetch(`${endpoint.revyahoo}${pos}`).then(res => res.json());

		if (result.errors !== 'OK') {
			const err = {
				errors: 'OUTSIDE_JA',
				maidenhead: result.maidenhead
			};
			cache_rev.set(pos, Promise.resolve(err));
			return err;
		}

		// 高度情報追加
		if (elev) {
			if (enable_gsi_elevation) {
				const elevResult = await elev_promise;
				result.elevation = elevResult.elevation;
				result.hsrc = elevResult.hsrc;

				if (elevResult.elevation === '-----') {
					result.errors = 'OUTSIDE_JA';
				}
			} else {
				// ここのelavationって綴りミスってるから直しとくわ！
				result.elevation = '-----';
				result.hsrc = '-----';
			}
		}

		cache_rev.set(pos, Promise.resolve(result));
		return result;

	} catch (error) {
		console.error("Error in local_reverse_geocoder_yahoo:", error);
		const err = {
			errors: 'ERROR',
			maidenhead: null
		};
		cache_rev.set(pos, Promise.resolve(err));
		return err;
	}
}

const cache_elev = new Map();

async function local_get_elevation(lat, lng) {
	let pos = '?lat=' + String(lat) + '&lon=' + String(lng);
	let result = {};

	if (cache_elev.has(pos)) {
		return cache_elev.get(pos);
	}

	if (cache_elev.size >= 16) {
		const oldest = cache_elev.keys().next().value;
		cache_elev.delete(oldest);
	}

	let elev_uri = endpoint['elevation'] + pos + '&outtype=JSON';
	let res_elev = fetch(elev_uri)
		.then(res => {
			if (!res.ok) {
				throw new Error(res.status)
			} else
				return res.json()
		})
		.then(res => {
			result['elevation'] = res['elevation']
			result['hsrc'] = res['hsrc']
			if (res['elevation'] == '-----')
				result['errors'] = 'OUTSIDE_JA';
			else
				result['errors'] = 'OK';
			return result;
		})
		.catch(error => {
			console.log(error);
			result['elevation'] = '-----';
			result['errors'] = 'OUTSIDE_JA';
			return result;
		});

	cache_elev.set(pos, res_elev);

	return res_elev;
}

