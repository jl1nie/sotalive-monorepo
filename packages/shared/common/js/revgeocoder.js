const endpoint = {
	'revgeocode': 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress',
	'revyahoo': 'https://www.sotalive.net/api/reverse-geocoder/LonLatToAddressMapCode',
	'elevation': 'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php',
	'muni': 'https://sotaapp2.sotalive.net/api/v2/locator/jcc-jcg'
};

const cache_rev = new Map();

var use_yahoo_revgeocode = false;
var enable_gsi_elevation = true;

// japanmapcode.com はJSON APIの提供を終了し通常のWebページになったため、
// 座標を自動変換するのではなくクリップボードにコピーしてサイトを開くだけにする。
// (マップコードの変換アルゴリズムはDENSOの非公開技術で、サービスへの組み込みには
// 別途ライセンスが必要なため)
//
// タブを開く処理は window.open() を使わず、リンク要素自体の
// href="https://japanmapcode.com/en" target="_blank" によるネイティブ遷移に任せる。
// Safariは script からの window.open() をバックグラウンドタブとして開くことがあり、
// (ユーザーには「反応がない」ように見える)、通常の <a target="_blank"> クリックだけは
// フォアグラウンドで開かれるため。この関数は preventDefault せず、
// クリップボードコピー+トースト表示のみを副作用として行う。
function mapcode_copy_coords(event, lat, lng) {
	const coord = `${lat},${lng}`;
	const anchorRect = event && event.currentTarget ? event.currentTarget.getBoundingClientRect() : null;

	// この後 target="_blank" のネイティブ遷移が発生し、モバイル(特にiOS Safari)では
	// 新規タブが前面で開いて元のドキュメントが即座にフォーカスを失う。
	// navigator.clipboard.writeText() は非同期APIのため、遷移がPromiseの解決より先に
	// 起きるとフォーカス喪失により書き込みが失敗する(PCでは遷移が相対的に遅いため顕在化しにくい)。
	// execCommand('copy') はイベントハンドラ内で同期的に完了するため、遷移前に確実にコピーできる。
	if (mapcode_copy_sync(coord)) {
		mapcode_show_toast('座標をコピーしました。検索欄に貼り付けて (Ctrl+V / ⌘V) Enterしてください', anchorRect);
	} else if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(coord)
			.then(() => mapcode_show_toast('座標をコピーしました。検索欄に貼り付けて (Ctrl+V / ⌘V) Enterしてください', anchorRect))
			.catch(() => mapcode_show_toast(`コピーに失敗しました。検索欄に「${coord}」を入力してください`, anchorRect));
	} else {
		// クリップボードAPI非対応ブラウザ(非HTTPS等)では座標をそのまま案内する
		mapcode_show_toast(`このブラウザは自動コピーに対応していません。検索欄に「${coord}」を入力してください`, anchorRect, 8000);
	}
}

function mapcode_copy_sync(text) {
	try {
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.style.position = 'fixed';
		textarea.style.top = '0';
		textarea.style.left = '-9999px';
		document.body.appendChild(textarea);
		textarea.focus();
		textarea.select();
		textarea.setSelectionRange(0, text.length); // iOS Safari対策
		const ok = document.execCommand('copy');
		document.body.removeChild(textarea);
		return ok;
	} catch (e) {
		return false;
	}
}

function mapcode_show_toast(message, anchorRect, duration = 4000) {
	let toast = document.getElementById('mapcode-toast');
	if (!toast) {
		toast = document.createElement('div');
		toast.id = 'mapcode-toast';
		toast.style.cssText = 'position:fixed;background:rgba(0,0,0,.85);color:#fff;padding:8px 12px;' +
			'border-radius:6px;font-size:13px;line-height:1.4;box-shadow:0 2px 8px rgba(0,0,0,.3);' +
			'z-index:9999;opacity:0;transition:opacity .3s;max-width:240px;text-align:center;pointer-events:none;';
		document.body.appendChild(toast);
	}
	toast.textContent = message;
	clearTimeout(toast._hideTimer);

	const margin = 8;
	if (!anchorRect) {
		toast.style.transform = 'translateX(-50%)';
		toast.style.left = '50%';
		toast.style.top = 'auto';
		toast.style.bottom = '24px';
		toast.style.opacity = '1';
		toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
		return;
	}

	// 位置確定前にちらつかせないよう、画面外で不透明度0のまま計測してから一度に表示する
	toast.style.transform = 'none';
	toast.style.opacity = '0';
	toast.style.left = '-9999px';
	toast.style.top = '-9999px';

	requestAnimationFrame(() => {
		const tRect = toast.getBoundingClientRect();
		let left = anchorRect.left + anchorRect.width / 2 - tRect.width / 2;
		left = Math.min(Math.max(left, margin), window.innerWidth - margin - tRect.width);

		let top = anchorRect.bottom + margin;
		if (top + tRect.height > window.innerHeight - margin) {
			top = anchorRect.top - margin - tRect.height;
		}

		toast.style.left = left + 'px';
		toast.style.top = top + 'px';
		toast.style.opacity = '1';
	});

	toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
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

