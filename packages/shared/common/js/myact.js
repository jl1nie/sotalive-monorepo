// 参照の検索ボックス(もとは、ボタンの並びのあとにあった inline の script)
$("#search_ref").searchinput({ width: 65, done: function (s) { showReference(s) } })

var prefs =
{
	'popup_permanent': true,
	'display_mapcode': false,
	'link_googlemap': false,
	'by_call': false,
	'sota_ref': true,
	'pota_ref': true,
	'jaff_ref': true,
	// 以前の版と同じ Cookie 名。保存してある設定があれば、それに従う
	'display_area': true,
	'aprs_track': true,
	'pilgrim': false,
	'show_potalog': false,
	'show_potaactlog': true,
	'zoom_threshold': 12,
	'spot_period': 6,
	'pota_hunter_uuid': null,
	'pota_activator_uuid': null,
	'enable_emulation': false,
	'pemu_call': '',
	'pemu_areacode': '',
	'pemu_century': '',
	'pemu_sota': '',
	'pemu_pota': '',
	'pemu_jaff': '',
	'pemu_mesg1': 'CQ CQ CQ DE $CALL SOTA $SOTA +',
	'pemu_mesg2': 'CQ CQ CQ DE $CALL POTA $POTA +',
	'pemu_mesg3': 'CQ CQ CQ DE $CALL JAFF $JAFF +',
	'pemu_mesg4': 'p 1#CQ CQ CQ DE $CALL SOTA $SOTA+',
	'pemu_wpm': '40',
	'pemu_host': 'actpaddle.local',
	'include_areacode': true,
	'paddle_reverse': false,
	'to_paddle': true,
	'to_key': false,
	'enable_wifi': false,
	'enable_serial': true,
};

var sotaapp2 = 'https://sotaapp2.sotalive.net/api/v2'
// SOTAスポットは提供元の旧APIが廃止されたため停止中。再開したら true にする(スポット一覧の案内が消える)
var SOTA_SPOTS_AVAILABLE = false;
var show_summit_marker = [];

async function fetchAPI(endpoint, method, data) {
	const encodedEndpoint = endpoint.split('/').map(part => encodeURIComponent(part)).join('/');
	const url = sotaapp2 + encodedEndpoint;
	const options = {
		method: method,
		//headers: {
		//'Content-Type': 'application/json'
		//},
		body: method === 'POST' || method === 'PUT' ? data : undefined
	};

	try {
		const response = await fetch(url, options);
		if (!response.ok) {
			throw new Error(`Error ${response.status}: ${response.statusText}`);
		}

		if (method === 'DELETE') {
			return {}
		}
		let res = await response.json();
		return res;
	} catch (error) {
		console.error(`API ${endpoint} request failed:`, error);
		return null;
	}
}

var enable_experimental = false;

if (location.host != 'mypilgrim.sotalive.net') {
	enable_experimental = false;
	document.getElementById('check-pilgrim').style.display = 'none';
}
else {
	enable_experimental = true;
	document.getElementById('check-pilgrim').style.display = 'block';
}

var tolerance;
if (navigator.userAgent.match(/iPhone|Android.+Mobile/)) {
	tolerance = 30;
} else {
	tolerance = 5;
}

let vh = window.innerHeight * 0.01;
document.documentElement.style.setProperty('--vh', `${vh}px`);
window.addEventListener('resize', () => {
	let vh = window.innerHeight * 0.01;
	document.documentElement.style.setProperty('--vh', `${vh}px`);
});

if (use_yahoo_revgeocode) {
	gsi_attribution = "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>|<a href='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A10-v4_1.html' target='_blank'>国土数値情報自然公園地域データ</a>|<a href='https://developer.yahoo.co.jp/sitemap/'>Web Services by Yahoo! JAPAN</a>"
} else {
	gsi_attribution = "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>|<a href='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A10-v4_1.html' target='_blank'>国土数値情報自然公園地域データ</a>"
}
var gsi = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
	maxZoom: 18, maxNativeZoom: 18, attribution: gsi_attribution
});

var gsi_photo = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', {
	maxZoom: 18, maxNativeZoom: 18, attribution: gsi_attribution
});

var osm = L.tileLayer('https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=767750c193e54ceeb3aee08d880bdb90', {
	maxZoom: 18, maxNativeZoom: 18, attribution: "<a href='https://www.thunderforest.com/'>Thunderforest</a>"
});

var yamareco_summer = L.tileLayer('https://www.yamareco.com/modules/yamareco/include/get_tileimg.php?type=dot_summer&z={z}&y={y}&x={x}', {
	maxZoom: 18, maxNativeZoom: 16, attribution: "<a href='https://www.yamareco.com/' target='_blank'>ヤマレコ</a>"
});

var yamareco_winter = L.tileLayer('https://www.yamareco.com/modules/yamareco/include/get_tileimg.php?type=dot_winter&z={z}&y={y}&x={x}', {
	maxZoom: 18, maxNativeZoom: 16, attribution: "<a href='https://www.yamareco.com/' target='_blank'>ヤマレコ</a>"
});

var map = L.map('map', {
	renderer: L.canvas({ tolerance: tolerance }),
	layers: [gsi]
});

var baseLayerControls = {
	'地理院地形図': gsi,
	'全国最新写真': gsi_photo,
	'OSM': osm
};

if (enable_experimental) {
	var overlayLayerControls = {
		'ヤマレコみんなの足跡(登山道)': yamareco_summer,
		'ヤマレコみんなの足跡(雪山)': yamareco_winter,
	};
	L.control.layers(baseLayerControls, overlayLayerControls, {
		collapsed: true,
	}).addTo(map);
} else {
	L.control.layers(baseLayerControls, null, {
		collapsed: true,
	}).addTo(map);
};

L.control.scale().addTo(map);
L.control.zoomLabel().addTo(map);

var popup = L.popup();

var last_area = null;
var last_mesg = '';
var geomagindex = 'A:-- K:-';


function redrawPopup() {
	if (last_area != null) {
		var ctnt = '<b>' + selectRef(last_area, true) + '</b>' + last_mesg;
		popup.setContent(ctnt);
		popup.update();
	}
}

function locURI(lat, lng, zoom) {
	var gsiuri = 'https://maps.gsi.go.jp/',
		googleuri = 'https://www.google.com/maps/@?api=1&map_action=map&',
		googleuri2 = 'https://www.google.com/maps/search/?api=1&query=';

	if (prefs['link_googlemap']) {
		var res = googleuri + 'center=' + lat + ',' + lng + '&zoom=' + zoom + '&basemap=satellite',
			res2 = googleuri2 + lat + '%2C' + lng;

		return res2;
	} else {
		return gsiuri + '#' + zoom + '/' + lat + '/' + lng;
	}
}

async function potaLog(command) {
	let keys = ['pota_activator_uuid', 'pota_hunter_uuid'];
	let res = null;
	let api = '/pota';
	switch (command) {
		case 'check':
			for (var k of keys) {
				var el, mesg;

				if (prefs[k] == null) {
					el = document.getElementById(k);
					el.innerText = '----';
					continue;
				}

				res = await fetchAPI(api + `/log/${prefs[k]}`, 'GET');

				if (res && res['logId']) {
					prefs[k] = res['logId'];
					el = document.getElementById(k);
					if (k.includes('hunter')) {
						mesg = '(Hunter)';
					} else {
						mesg = '(Activator)';
					}
					el.innerText = res['lastUpdate'] + mesg;
				} else {
					prefs[k] = null;
					el = document.getElementById(k);
					el.innerText = '----';
				}
			}
			break;

		case 'del-act':
			k = 0;

		case 'del-hunt':
			if (command.includes('hunt'))
				k = 1;

			if (prefs[keys[k]] == null)
				break;

			res = await fetchAPI(api + `/log/${prefs[keys[k]]}`, 'DELETE');

			if (res) {
				prefs[keys[k]] = null;
				el = document.getElementById(keys[k]);
				el.innerText = '----';
				if (k == 0)
					potaLog('show-hunt');
				else
					potaLog('show-act');
			}

			potaLog('check');

			break;

		case 'show-act':
			prefs['show_potalog'] = true;
			prefs['show_potaactlog'] = true;

			el = document.getElementById('show_potaactlog');
			el.checked = true;

			el = document.getElementById('show_potalog');
			el.checked = true;

			break;

		case 'show-hunt':
			prefs['show_potalog'] = true;
			prefs['show_potaactlog'] = false;

			el = document.getElementById('show_potaactlog2');
			el.checked = true;

			el = document.getElementById('show_potalog');
			el.checked = true;

			break;

		case 'upload':
			const file_input = document.getElementById('file_input');

			if (file_input.files.length == 0) {
				window.alert("ファイルを指定してください");
				return
			}

			const fd = new FormData();
			fd.append('uploadfile', file_input.files[0]);

			res = await fetchAPI(api + `/log/${prefs[keys[0]]}/${prefs[keys[1]]}`, 'POST', fd);

			if (res) {
				if (res['logKind'] == 'activator') {
					prefs[keys[0]] = res['logId'];
					potaLog('show-act');
				}
				else {
					prefs[keys[1]] = res['logId'];
					potaLog('show-hunt');
				}
				potaLog('check');
			} else {
				mesg =
					"不正なログファイルの形式です\n" +
					"POTA.appからダウンロードしたCSVファイルをアップロードして下さい";
				window.alert(mesg);
			}
			break;

		case 'export':
			res = await fetchAPI(api + `/log-share/${prefs[keys[0]]}/${prefs[keys[1]]}`, 'GET');

			if (res) {
				el = document.getElementById('pota_export_key');
				el.innerHTML = '<b>' + escapeHTML(res['share_id']) + '</b>';
			} else {
				window.alert("Exportに失敗しました")
			}
			break;

		case 'import':
			const sharekey = document.getElementById('import_uuid');
			res = await fetchAPI(api + `/log-share/${sharekey.value}`, 'GET');

			if (res) {
				prefs[keys[0]] = res['activator_logid'];
				prefs[keys[1]] = res['hunter_logid'];
				potaLog('check');

				if (res['activator_logid'] != null)
					potaLog('show-act')

				if (res['hunter_logid'] != null)
					potaLog('show-hunt')

			} else {
				window.alert("キーコードが見つかりません")
			}
			break;

		default:
			console.log("Unknown command" + command);
			break;
	}
}


function getLogID() {
	if (prefs['show_potaactlog'])
		return prefs['pota_activator_uuid'];
	else
		return prefs['pota_hunter_uuid']
}

// ボタンを押したときの対象(onclick の文字列に値を埋め込まない)
var keyer_area = null;

function keyerButton(area) {
	keyer_area = area;
	let bstr = '<center><button type="button" class="btn-outline-primary btn-sm" data-toggle="modal" data-target="#pemuact" onclick="clickPemuAct(keyer_area)"><img src="svg/clipboard.svg"></button></center>';
	return bstr;
}


function clickPemuAct(area) {
	document.getElementById("pemu_name").innerText = area['name'];
	for (k in prefs) {
		if (k.includes('pemu')) {
			let el = document.getElementById(k);
			if (prefs[k])
				el.value = prefs[k];
			else
				el.value = "";
		}
	}
	if (area['sota_code'])
		document.getElementById("pemu_sota").value = area['sota_code'];
	else
		document.getElementById("pemu_sota").value = '';

	if (area['pota'])
		document.getElementById("pemu_pota").value = area['pota'];
	else
		document.getElementById("pemu_pota").value = '';

	if (area['jaff'])
		document.getElementById("pemu_jaff").value = area['jaff'];
	else
		document.getElementById("pemu_jaff").value = '';

	if (area['areacode'])
		document.getElementById("pemu_areacode").value = area['areacode'];
	else
		document.getElementById("pemu_areacode").value = '';

	if (area['century'])
		document.getElementById("pemu_century").value = area['century'];
	else
		document.getElementById("pemu_century").value = '';
}

var serial_port = undefined;
var serial_writer = undefined;
var serial_reader = undefined;

async function open_serial() {
	const filters = [
		{ usbVendorId: 0x303a, usbProductId: 0x1001 },
		{ usbVendorId: 0x0403, usbProductId: 0x6001 },
		{ usbVendorId: 0x1a86, usbProductId: 0x55d4 },
		{ usbVendorId: 0x10c4, usbProductId: 0xea60 },
	];

	if (! "serial" in navigator) {
		window.alert("お使いのブラウザはシリアル通信が出来ません");
		return;
	}
	if (serial_port == undefined) {
		serial_port = await navigator.serial.requestPort({ filters });
		await serial_port.open({ baudRate: 115200 });
		const textEncoder = new TextEncoderStream();
		const writableStreamClosed = textEncoder.readable.pipeTo(serial_port.writable);
		serial_writer = textEncoder.writable.getWriter();
		serial_reader = serial_port.readable.getReader();
	}
}

async function pemuPressed(num) {
	clickPrefs();
	let msg = prefs["pemu_mesg" + String(num)].toUpperCase();
	let sota = prefs["pemu_sota"].replace('-', '');
	let pota = prefs["pemu_pota"].replace('-', '');
	let jaff = prefs["pemu_jaff"].replace('-', '');
	let areacode = prefs["pemu_areacode"];
	let century = prefs["pemu_century"];
	let wpm = parseInt(prefs["pemu_wpm"], 10);
	let enable_wifi = prefs["enable_wifi"];
	let pemuuri = 'https://' + prefs["pemu_host"] + '/play';
	let jsonmsg = {};

	let call = prefs["pemu_call"];

	if (prefs["include_areacode"] && areacode != "")
		call += '/' + areacode;


	let replaced_msg =
		msg.toUpperCase()
			.replace('$CALL', call)
			.replace('$SOTA', sota)
			.replace('$POTA', pota)
			.replace('$JAFF', jaff)
			.replace('$JCC', century)
			.replace('$JCG', century)

	jsonmsg["wpm"] = wpm;

	if (prefs["to_paddle"])
		jsonmsg["to_paddle"] = replaced_msg;
	else
		jsonmsg["to_straight"] = replaced_msg;

	if (prefs["paddle_reverse"])
		jsonmsg["reverse"] = true;
	else
		jsonmsg["reverse"] = false;

	let jsonstr = JSON.stringify(jsonmsg) + '\r';

	if (navigator.clipboard)
		navigator.clipboard.writeText(replaced_msg);

	if (enable_wifi) {
		console.log(pemuuri);
		await fetch(pemuuri, {
			method: 'POST',
			headers: {
				'Content-Type': 'applicatoin/json'
			},
			body: jsonstr
		})
			.then((res) => {
				if (!res.ok) {
					throw new Error(res.statusText);
				}
			})
			.catch((err) => {
				window.alert('接続エラー: ' + pemuuri + ' (' + err + ')');
			});
	} else {
		await open_serial();
		try {
			await serial_writer.write(jsonstr);
		} catch (err) {
			window.alert('接続エラー: ブラウザをリロードしてください');
		};
		console.log(jsonstr);
		let { value, done } = await serial_reader.read();
		const v = new TextDecoder().decode(value);
		console.log(v);
	}
}

// 東経→西経変換
function toWestLon(lon) {
	return lon > 180 ? lon - 360 : lon;
}

// 西経→東経変換
function toEastLon(lon) {
	return lon < 0 ? lon + 360 : lon;
}

function displayPopup(area, latlng, isMarker, isGPS) {
	var lat = Math.round(latlng.lat * 1000000, 4) / 1000000,
		lng = Math.round(toWestLon(latlng.lng) * 1000000, 4) / 1000000,
		z = map.getZoom();

	if (z > 11)
		wz = 11
	else
		wz = z;

	var windyuri = 'https://www.windy.com/' + latlng.lat + '/' + latlng.lng + '/meteogram?rain,' + latlng.lat + ',' + latlng.lng + ',' + wz;

	if (isGPS) {
		Cookies.set('my_qth_lat', lat)
		Cookies.set('my_qth_lng', lng)
	}

	var url = sotaapp2;
	var query = '?';
	var mode = '';
	var sname = '';

	if (area['pota']) {
		url += '/pota/parks/search';
		query += "pota_code=" + area['pota'];
		mode = 'POTA';
	} else {
		url += '/sota/summits/search';
		query += 'lat=' + latlng.lat + '&lon=' + toWestLon(latlng.lng) + "&dist=200";
		mode = 'SOTA';
	}

	let logid = getLogID();

	if (prefs['show_potalog'] && logid != null)
		query += "&log_id=" + logid;

	fetch(url + query)
		.then(res => res.json())
		.then(res => {
			var sotamesg = '';
			var potamesg = '';
			var qsomesg = '';
			if (res.length > 0) {
				if (mode == 'SOTA') {
					s = res[0]
					area['sota_code'] = s['summitCode'];
					area['sota'] = s['summitCode'] + ' ' + s['summitName'];
					if (s['summitNameJ'])
						sname = s['summitNameJ'];
					else
						sname = s['summitName'];

					if (area['name'])
						area['name'] += ' / ' + sname;
					else
						area['name'] = sname;

					l = { 'lat': s['latitude'], 'lng': s['longitude'] }
					displayActivationZone(l, -0.8);
					pos = '<br>位置:<a href="' + escapeHTML(locURI(s['latitude'], s['longitude'], z)) +
						'" target="_blank" rel="noopener">' + escapeHTML(s['latitude']) + ',' + escapeHTML(s['longitude']) + '</a>';
					sotamesg = escapeStr(s['cityJ']) + '<br>GL:' + escapeHTML(s['maidenhead']) + pos + '<br>標高:' + escapeHTML(s['altM']) + 'm,' + escapeHTML(s['points']) + 'pts (+' + escapeHTML(s['bonusPoints']) + ')';
					qsomesg += '<br>Activations: ' + escapeHTML(s['activationCount'])
					if (s['activationCount'] != 0)
						qsomesg += '<br>Last Activation: ' + escapeHTML(s['activationDate']) + '(' + escapeHTML(s['activationCall']) + ')';
				} else {
					p = res[0];
					if (!('pota' in area))
						area['pota'] = p['potaCode'];
					if (!('jaff' in area))
						area['jaff'] = p['wwffCode'];
					if (!('name' in area))
						area['name'] = p['parkNameJ'];
					if (prefs['show_potalog']) {
						if (p['attempts'] != null) {
							qsomesg = "<br>Activations/Attempts: " + escapeHTML(p['activations']) + "/" + escapeHTML(p['attempts'])
							qsomesg += "<br>QSOs: " + escapeHTML(p['qsos']) + "<br>";
						} else if (p['qsos'] != null)
							qsomesg = "<br>QSOs: " + escapeHTML(p['qsos']) + "<br>";
					}
				}
			}
			local_reverse_geocoder(latlng.lat, latlng.lng, true)
				.then(res => {
					if ('elevation' in res) {
						if ('alt' in latlng) {
							altitude = escapeHTML(res['elevation']) + 'm (GPS測位値:' + escapeHTML(latlng.alt) + 'm)';
						} else {
							altitude = escapeHTML(res['elevation']) + 'm';
						}
					} else
						altitude = '---';

					if (res['errors'] == 'OUTSIDE_JA') {
						mesg = 'Pos: ' + escapeHTML(lat) + ',' + escapeHTML(lng) + '<br>GL: ' + escapeHTML(res['maidenhead']);
					}
					else if (res['errors'] != 'OK') {
						mesg = 'Parameter out of range.';
					} else {
						accu = res['hsrc'] ? '<small>[' + escapeHTML(res['hsrc'].replace('（', '').replace('）', '')) + ']</small>' : ''

						if (isGPS)
							pos = '<br>位置:<a href="' + locURI(lat, lng, z) +
								'" target="_blank">' + lat + ',' + lng + '</a>';
						else
							pos = '<i><br>位置:<a href="' + locURI(lat, lng, z) +
								'" target="_blank">' + lat + ',' + lng + '</a></i>';

						if (res['jccCode'] != null) {

							if (res['wardCode'] != null) {
								area['century'] = 'JCC ' + res['wardCode'];
								mesg = 'JCC' + escapeHTML(res['jccCode']) + ' 区番号:' + escapeHTML(res['wardCode']) + '<br>' +
									escapeHTML(res['prefecture']) + escapeHTML(res['municipality']) + '<br>GL:' + escapeHTML(res['maidenhead']) +
									pos + '<br> 標高:' + altitude;
							}
							else {
								area['century'] = 'JCC ' + res['jccCode']
								mesg = 'JCC' + escapeHTML(res['jccCode']) + '<br>' + escapeHTML(res['prefecture']) + escapeHTML(res['municipality']) +
									'<br>GL:' + escapeHTML(res['maidenhead']) + pos + '<br> 標高:' + altitude;
							}
						}
						else {
							area['century'] = 'JCG ' + res['jcgCode'] + res['hamlogCode'];
							mesg = 'JCG' + escapeHTML(res['jcgCode']) + escapeHTML(res['hamlogCode']) + '<br>' + escapeHTML(res['prefecture']) + escapeHTML(res['jcgText']) +
								escapeHTML(res['municipality']) + '<br>GL:' + escapeHTML(res['maidenhead']) + pos + '<br> 標高:' + altitude;
						}
					}

					function cont(showMapcode) {
						weather = '&nbsp&nbsp<a href="' + windyuri +
							'" target="_blank"><img src="svg/sun.svg"><img src="svg/cloud.svg"><img src="svg/rain.svg"></a>';

						if (showMapcode)
							weather += '<div style="text-align:center"><a href="https://japanmapcode.com/en" target="_blank" onclick="mapcode_copy_coords(event, ' +
								latlng.lat + ',' + latlng.lng + ');"><img src="img/mc_long.jpg" height=14px></a></div>';

						if ('areacode' in res && res['areacode'])
							area['areacode'] = res['areacode'][0];

						if (sotamesg) {
							if (isGPS)
								mesg = sotamesg + '<br><b>現在地: </b>' + mesg;
							else
								mesg = sotamesg + '<br><b>クリック位置: </b>' + mesg;
						}
						cnt = selectRef(area, true);
						if (cnt != '') {
							cnt = '<b>' + cnt + '</b>' + mesg + weather + qsomesg;
							if (prefs["enable_emulation"])
								cnt += keyerButton(area);
						}
						else
							cnt = mesg + weather;

						popup.setLatLng(latlng)
							.setContent(cnt)
							.openOn(map);

						if (isMarker && qth_marker != null)
							qth_marker.bindPopup(cnt).openPopup();

						last_area = area;
						last_mesg = mesg;
					}

					cont(prefs['display_mapcode'])
				});
		});
}


$('#zoom-threshold').slider({
	formatter: function (value) {
		prefs['zoom_threshold'] = Number(value);
		return '全ての公園を表示するズームレベル ' + value;
	}
});

$('#spot-period').slider({
	formatter: function (value) {
		prefs['spot_period'] = Number(value);
		return '最新' + value + "時間を表示";
	}
});

function clickPrefs() {
	potaLog('check');

	for (var k in prefs) {
		if (k == 'zoom_threshold' || k == 'spot_period' || k.includes('uuid')) {
			// 登録していないログ ID は "null"(undefined を文字列にして保存しない)
			Cookies.set(k, prefs[k] == null ? 'null' : String(prefs[k]),
				{ expires: 1800, SameSite: 'Lax' });
		} else if (k.includes('pemu')) {
			prefs[k] = document.getElementById(k).value;
			Cookies.set(k, prefs[k], { expires: 1800, SameSite: 'Lax' });
		} else {
			var el = document.getElementById(k);
			if (el.checked == true) {
				prefs[k] = true;
				Cookies.set(k, 'true', { expires: 1800, SameSite: 'Lax' })
			} else {
				prefs[k] = false;
				Cookies.set(k, 'false', { expires: 1800, SameSite: 'Lax' })
			}
		}
	}
	updateGeoJson();
}

function readCookie(pref) {
	for (var k in pref) {
		var ck = Cookies.get(k);
		if (k == 'zoom_threshold') {
			if (ck == undefined) {
				ck = '12';
				Cookies.set(k, ck, { expires: 1800, SameSite: 'Lax' });
			}
			else
				pref[k] = Number(ck)
			$('#zoom-threshold').slider('setValue', Number(ck))
		}
		else if (k == 'spot_period') {
			if (ck == undefined) {
				ck = '6';
				Cookies.set(k, ck, { expires: 1800, SameSite: 'Lax' });
			}
			else
				pref[k] = Number(ck)
			$('#spot-period').slider('setValue', Number(ck))
		}
		else if (k.includes('uuid')) {
			// 登録していないときは null(Cookie がない・"null"・以前の版が保存した "undefined")
			if (ck == undefined || ck == "" || ck == "null" || ck == "undefined")
				pref[k] = null;
			else
				pref[k] = ck;
		} else if (k.includes('pemu')) {
			if (ck)
				pref[k] = ck;
			document.getElementById(k).value = pref[k];
		}
		else {
			if (ck == undefined) {
				if (pref[k])
					Cookies.set(k, 'true', { expires: 1800, SameSite: 'Lax' })
				else
					Cookies.set(k, 'false', { expires: 1800, SameSite: 'Lax' })
			} else {
				if (ck == 'true')
					pref[k] = true
				else
					pref[k] = false
			}
			var el = document.getElementById(k);
			if (pref[k])
				el.checked = true
			else
				el.checked = false;
		}
	}

	if (pref['show_potaactlog'])
		potaLog('show-act')
	else
		potaLog('show-hunt')

	potaLog('check');
}

function closePrefs() {
	clickPrefs();
	redrawPopup();
	redrawMarkers();
	refresh_spots();
	refresh_aprs_track();
}

readCookie(prefs);

function selectRef(area, addhref) {
	var pname = '';

	if (area['pota'] != undefined && area['jaff'] != undefined) {
		if (area['pota'] != '' && prefs['pota_ref']) {
			if (addhref && area['pota'].includes('-'))
				pname = '<a target="_blank" rel="noopener" href="https://pota.app/#/park/' + encodeURIComponent(area['pota']) + '">' + escapeHTML(area['pota']) + '</a> '
			else
				pname = escapeHTML(area['pota']);
			if (area['jaff'] != '' && prefs['jaff_ref']) {
				if (addhref && area['jaff'].includes('-'))
					pname += '/' + '<a target="_blank" rel="noopener" href="https://wwff.co/directory/?showRef=' + encodeURIComponent(area['jaff']) + '">' + escapeHTML(area['jaff']) + '</a> '
				else
					pname += '/' + escapeHTML(area['jaff']);
			}
		} else if (prefs['jaff_ref']) {
			if (addhref)
				pname = '<a target="_blank" rel="noopener" href="https://wwff.co/directory/?showRef=' + encodeURIComponent(area['jaff']) + '">' + escapeHTML(area['jaff']) + '</a> '
			else
				pname = escapeHTML(area['jaff'])
		}
	} else if (area['temple'] != undefined && prefs['pilgrim']) {
		pname = escapeHTML(area['temple'])
	};

	if (area['sota']) {
		sname = '<a target="_blank" rel="noopener" href="https://summits.sota.org.uk/summit/' + encodeURIComponent(area['sota_code']) + '">' + escapeHTML(area['sota']) + '</a>'

		if (pname == '')
			pname = sname;
		else
			pname = pname + ' ' + sname;
	}

	if (pname != '' && area['name'] != '') {
		pname += '<br>'
		pname += escapeHTML(area['name']);
	}

	if (pname != '')
		pname = '<div style="text-align:center">' + pname + '</div>';

	return pname;
}

qth_marker = null

function QTHdragend(e) {
	var latlng = e.target.getLatLng();
	map.setView(latlng, 15);
	displayPopup({}, latlng, true, false);
}

function callbkQTHOk(arg) {
	var crd = arg.coords;
	var latlng = [crd.latitude, crd.longitude],
		options = {
			prefix: 'icon'
			, icon: 'user'
			, shape: 'circle'
			, markerColor: 'yellow'
			, extraClasses: 'semantic-ui-custom'
		};

	if (false && crd.altitude != null) {
		r_alt = Math.round(crd.altitude * 100) / 100;
		gps_pos = { lat: crd.latitude, lng: crd.longitude, alt: r_alt };
	}
	else
		gps_pos = { lat: crd.latitude, lng: crd.longitude };

	map.setView(latlng, 15);

	if (qth_marker != null)
		map.removeLayer(qth_marker)

	qth_marker = L.marker(latlng,
		{ draggable: true, icon: L.ExtraMarkers.icon(options) });

	qth_marker.addTo(map);
	displayPopup({}, gps_pos, true, true);
	qth_marker.on('dragend', QTHdragend);
};

function callbkQTHNG(arg) {
	var emsg = "エラーが発生しました",
		lat = Cookies.get('my_qth_lat'),
		lng = Cookies.get('my_qth_lng'),
		zoom = 13;

	switch (arg.code) {
		case 1:
			emsg = "位置情報の利用が許可されていません";
			break;
		case 2:
			emsg = "端末位置がわかりませんでした";
			break;
		case 3:
			emsg = "タイムアウトしました";
			break;
	}
	window.alert(emsg);

	if (lat)
		latlng = [parseFloat(lat), parseFloat(lng)];
	else {
		latlng = [37.514444, 137.712222];
		zoom = 6;
	};
	map.setView(latlng, zoom);
};

function clickQTHButton() {
	if (typeof navigator.geolocation === 'undefined') {
		console.log("navigator.gelocation unsupported");
		window.alert('ブラウザが位置情報取得に対応していません');
		map.setView([37.514444, 137.712222], 6);
		return;
	}

	var options = {
		"enableHighAccuracy": true,
		"timeout": 10000,
		"maximumAge": 0
	}
	navigator.geolocation.getCurrentPosition(callbkQTHOk, callbkQTHNG, options);
};

function kp_index() {
	fetch(sotaapp2 + "/propagation/geomag")
		.then(res => res.ok ? res.json() : null)
		.catch(e => console.warn('geomag:', e))
		.then(geomag => {
			if (!geomag)
				return;
			kp = geomag.kIndex[0];
			ap = geomag.aIndex;
			geomagindex = 'A:' + ap + ' K:' + kp;
		});
}

function clock() {
	var now = new Date();
	var tm = now.toString();
	tm = tm.replace(/:\d{2} GMT\+.+/, '');
	var tm2 = `${now.getFullYear().toString().slice(-2)}/${("00" + (now.getMonth() + 1).toString()).slice(-2)}/${("00" + now.getDate().toString()).slice(-2)} ${("00" + now.getHours().toString()).slice(-2)}:${("00" + now.getMinutes().toString()).slice(-2)}`;
	var tm3 = `${("00" + (now.getMonth() + 1).toString()).slice(-2)}/${("00" + now.getDate().toString()).slice(-2)} ${("00" + now.getHours().toString()).slice(-2)}:${("00" + now.getMinutes().toString()).slice(-2)}`;

	document.getElementById("clock_time").innerHTML = '&nbsp' + tm2 + '&nbsp' + geomagindex;
	document.getElementById("clock_time2").innerHTML = '&nbsp' + tm3;
}

function escapeStr(str) {
	var escstr;
	if (!str)
		escstr = ""
	else
		escstr = str
	var replacement = [[/&/g, "&amp;"], [/</g, "&lt;"], [/>/g, "&gt;<br>"], [/"/g, "&quot;"]]
	for (var e in replacement)
		escstr = escstr.replace(replacement[e][0], replacement[e][1]);
	escstr = escstr.replace(/<br>$/, '');
	return escstr;
}



function deleteSummitMarker() {
	while (show_summit_marker.length > 0) {
		var m = show_summit_marker.pop()
		map.removeLayer(m)
	}
}

var _popupMarker = null

function clearSummitMarker() {
	userChange = true
	_popupMarker = null
}

function popupSummitMarker(latlng) {
	userChange = true
	_popupMarker = latlng
}

function placeSummitMarkers(nw, se, z, needtrans) {
	var popup, elev, prefix, level, query, programs, logid;

	if (z >= prefs['zoom_threshold']) {
		elev = 0;
		level = 0;
	}
	else if (z > 9) {
		elev = 800;
		level = 1;
	}
	else if (z > 8) {
		elev = 1000;
		level = 10;
	}
	else if (z > 6) {
		elev = 1500;
		level = 20;
	}
	else {
		elev = 4000;
		level = 30;
	}

	programs = 'JAFFPOTA';
	if (prefs['sota_ref'])
		programs += 'SOTA';

	// if (enable_experimental && prefs['pilgrim'])
	// 	programs += 'PILGRIM';

	logid = getLogID();

	if (prefs['show_potalog'] && logid != null) {
		query = 'min_lat=' + se[0] + '&min_lon=' + nw[1]
			+ '&max_lat=' + nw[0] + '&max_lon=' + se[1] +
			'&min_elev=' + elev + '&min_area=' + level + '&log_id=' + logid;
	} else
		query = 'min_lat=' + se[0] + '&min_lon=' + nw[1]
			+ '&max_lat=' + nw[0] + '&max_lon=' + se[1] +
			'&min_elev=' + elev + '&min_area=' + level;

	res = fetch(sotaapp2 + '/search?' + query)
		.then(res => res.ok ? res.json() : null)
		.catch(e => console.warn('search:', e))
		.then(res => {
			if (!res)
				return;

			if (z > 11)
				wz = 11
			else
				wz = z;
			if (prefs['sota_ref'])
				for (const s of res['sota']) {

					if (needtrans)
						s['lon'] = toEastLon(s['lon']);

					popup = false
					if (_popupMarker &&
						s['lat'] == _popupMarker[0] &&
						s['lon'] == _popupMarker[1]) {
						popup = true
						_popupMarker = null
					}
					show_summit_marker.push(placeSummitMarker([s['lat'], s['lon']], z, s['alt'], s['count'], popup))
				}
			for (const s of res['pota']) {
				if (needtrans)
					s['lon'] = toEastLon(s['lon']);

				var pname = selectRef({
					'pota': s['pota'],
					'jaff': s['wwff'],
					'name': s['nameJ']
				}, false);
				if (pname != '')
					show_summit_marker.push(placeParkMarker([s['lat'], s['lon']], z, s))
			}
			/*
			for (const t of res['temples']) {
				show_summit_marker.push(
					placeTempleMarker([t['lat'], t['lon']], z, t))
			}
					*/
		});
}

function placeSummitMarker(coords, z, elev, actcnt, popupfl) {

	var rad;
	if (z > 14)
		rad = 10
	else if (z > 12)
		rad = 8
	else if (z > 10)
		rad = 6
	else
		rad = 4

	var fillc,
		border = "#4e342e"

	if (elev > 1500)
		fillc = "#c62828"
	else if (elev > 1100)
		fillc = "#ef6c00"
	else if (elev > 850)
		fillc = "#f9a825"
	else if (elev > 650)
		fillc = "#9e9d24"
	else if (elev > 500)
		fillc = "#558b2f"
	else
		fillc = "#1b5e20"

	var marker =
		L.circleMarker(coords,
			{
				color: border,
				fillColor: fillc,
				radius: rad,
				weight: 2,
				fillOpacity: 0.8,
				opacity: 1
			});
	if (z > 11) {
		marker.bindTooltip(String(actcnt),
			{ permanent: true, direction: 'center', className: 'my-tooltip-label', offset: [0, 0] })
	}
	var m = marker.addTo(map);

	m.on('click', function (e) {
		var l = e['target']['_latlng'];
		L.DomEvent.stopPropagation(e);
		displayPopup({}, l, false, false);
	});
	return m;

}

function placeParkMarker(coords, z, parks) {

	if (parks['date'] != null) {
		if (parks['locid'].length == 1) {
			if (!prefs['show_potaactlog'] || parks['act'] > 0)
				markerColor = 'red';
			else
				markerColor = 'yellow'
		}
		else
			markerColor = 'orange';
	} else {
		markerColor = 'green-light';
	}

	var options = {
		prefix: 'icon'
		, icon: 'tree'
		, shape: 'square'
		, markerColor: markerColor
		, extraClasses: 'semantic-ui-custom'
	}, area = {
		pota: parks['pota'],
		jaff: parks['wwff'],
		name: parks['nameJ']
	};

	var marker = L.marker(coords, { icon: L.ExtraMarkers.icon(options) }),
		mesg1 = selectRef(area, false),
		mesg2 = selectRef(area, true);

	marker.bindTooltip(mesg1,
		{ permanent: prefs['popup_permanent'], direction: 'center', offset: [0, 20] })
	var m = marker.addTo(map);
	m.on('click', function (e) {
		displayPopup(area, e.latlng, false, false)
	});
	return m;
}

function placeTempleMarker(coords, z, temple) {
	markerColor = 'orange';
	var options = {
		prefix: 'icon'
		, icon: 'leaf'
		, shape: 'square'
		, markerColor: markerColor
		, extraClasses: 'semantic-ui-custom'
	}, area = {
		temple: temple['site_no'] + ' ' + temple['sacredplace'],
		name: temple['name']
	};

	var marker = L.marker(coords, { icon: L.ExtraMarkers.icon(options) });

	marker.bindTooltip(temple['site_no'] + ' ' + temple['name'],
		{ permanent: prefs['popup_permanent'], direction: 'center', offset: [0, 20] })
	var m = marker.addTo(map);
	m.on('click', function (e) {
		displayPopup(area, e.latlng, false, false)
	});
	return m;
}

function showReference(s) {
	latlng = s['coord']

	map.setView(latlng, 15);
	if (s['code'].match(/JA\d*\/.+/)) {
		displayPopup({}, { 'lat': s['coord'][0], 'lng': s['coord'][1] }, false, false);
	}
	redrawMarkers();
}

L.TopoJSON = L.GeoJSON.extend({
	addData: function (data) {
		var geojson, key;
		if (data.type === "Topology") {
			for (key in data.objects) {
				if (data.objects.hasOwnProperty(key)) {
					geojson = topojson.feature(data, data.objects[key]);
					L.GeoJSON.prototype.addData.call(this, geojson);
				}
			}
			return this;
		}
		L.GeoJSON.prototype.addData.call(this, data);
		return this;
	}
});

L.topoJson = function (data, options) {
	return new L.TopoJSON(data, options);
};

var geojson = L.topoJson(null, {
	attribution: "公園区域: <a href='https://www.biodic.go.jp/' target='_blank'>国立公園区域GISデータ(環境省生物多様性センター)</a>・<a href='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A10-v3_1.html' target='_blank'>国土数値情報(自然公園地域)</a>を加工",
	style: function (feature) {
		return {
			color: "#000",
			opacity: 1,
			weight: 1,
			fillColor: '#9fa8da',
			fillOpacity: 0.3
		};
	},
	onEachFeature: function (feature, layer) {
		layer.on('click', function (e) {
			displayPopup({
				'pota': feature.properties.POTA,
				'jaff': feature.properties.JAFF,
				'name': feature.properties.NAME,
			},
				e.latlng, false, false);
			L.DomEvent.stop(e);
		});
		layer.on('contextmenu', function (e) {
			displayPopup({
				'pota': feature.properties.POTA,
				'jaff': feature.properties.JAFF + '(' + feature.properties.PID + ',' + feature.properties.UID + ')',
				'name': feature.properties.NAME,
			},
				e.latlng, false, false);
			L.DomEvent.stop(e);
		});
	}
});


kp_index();
setInterval(kp_index, 1000 * 1800);
clock();
setInterval(clock, 5000);

async function getGeoData(url) {
	let response = await fetch(url);
	let data = await response.json();
	return data;
}

async function getGeoData(url) {
	let response = await fetch(url);
	let data = await response.json();
	return data;
}

// 自然公園の領域。表示にしたときに初めて読み込み、その後は層の付け外しだけをする
var areas_loaded = false;

function updateGeoJson() {
	if (typeof geojson === 'undefined' || !map)
		return;
	if (prefs['display_area']) {
		if (!map.hasLayer(geojson))
			geojson.addTo(map);
		if (!areas_loaded) {
			areas_loaded = true;
			getGeoData('json/jaffpota-annotated-v24.json').then(data => geojson.addData(data));
		}
	} else if (map.hasLayer(geojson)) {
		map.removeLayer(geojson);
	}
}

updateGeoJson();

userChange = true;

map.on('click', function (e) {
	displayPopup({}, e.latlng, false, false);
});

map.on('dragend', function (e) {
	userChange = true
})

map.on('zoomend', function (e) {
	userChange = true
})

function placeHamFairMarker(coord) {
	var options = {
		prefix: 'icon'
		, icon: 'star'
		, shape: 'square'
		, markerColor: 'pink'
		, riseOnHover: true
		, extraClasses: 'semantic-ui-custom'
	},
		area = {
			pota: 'Ham Fair 2023',
			jaff: '',
			name: 'ハムフェア2023'
		};

	var marker = L.marker(coord, { icon: L.ExtraMarkers.icon(options) });
	marker.bindTooltip('<b><a href="https://www.jarl.org/Japanese/1_Tanoshimo/1-3_Ham-Fair/2023/Ham-Fair-yoko.htm" target="_blank">Ham Fair 2023</a></b>', { permanent: prefs['popup_permanent'], direction: 'center', offset: [0, 20], interactive: true })
	var m = marker.addTo(map);
	m.on('click', function (e) {
		displayPopup(area, coord, false, false)
	});
}

function redrawMarkers() {
	deleteSummitMarker();
	var z = map.getZoom();
	var b = map.getBounds();
	let orgsw = b['_southWest']['lng'];
	let orgne = b['_northEast']['lng'];
	var swlon = toWestLon(orgsw);
	var nelon = toWestLon(orgne);

	if (nelon == orgne) {
		placeSummitMarkers([b['_northEast']['lat'], orgsw],
			[b['_southWest']['lat'], orgne], z, false);
	} else if (swlon != orgsw) {
		placeSummitMarkers([b['_northEast']['lat'], swlon],
			[b['_southWest']['lat'], nelon], z, true);

	} else {
		placeSummitMarkers([b['_northEast']['lat'], orgsw],
			[b['_southWest']['lat'], 180], z, false);
		placeSummitMarkers([b['_northEast']['lat'], -180],
			[b['_southWest']['lat'], nelon], z, true);
	}
	//placeHamFairMarker({'lat':35.627288040687716, 'lng':139.79562967407333});
}

map.on('moveend', function (e) {
	if (userChange) {
		userChange = false;
		redrawMarkers();
	}
});

// URL で地点を指定して開く: ?lat=35.2018&lon=137.1724(&z=ズーム。既定 15)
// その地点をクリックしたときと同じポップアップ(JCC/JCG・サミット・標高)を出す。指定がなければ現在地
function urlPosition() {
	var q = new URLSearchParams(window.location.search),
		lat = parseFloat(q.get('lat')),
		lng = parseFloat(q.get('lon')),
		z = parseInt(q.get('z'), 10);

	if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180))
		return null;
	if (!(z >= 5 && z <= 18))
		z = 15;
	return { latlng: L.latLng(lat, lng), zoom: z };
}

var urlpos = urlPosition();
if (urlpos) {
	map.setView(urlpos.latlng, urlpos.zoom);
	displayPopup({}, urlpos.latlng, false, false);
} else
	clickQTHButton();

//Latest Spot Chart
const plugin = {
	id: 'customCanvasBackgroundColor',
	beforeDraw: (chart, args, options) => {
		const { ctx } = chart;
		ctx.save();
		ctx.globalCompositeOperation = 'destination-over';
		ctx.fillStyle = options.color || '#99ffff';
		ctx.fillRect(0, 0, chart.width, chart.height);
		ctx.restore();
	}
};

var chart = null;
var chart2 = null;
var prevloc = null;
var target_prog = ['POTA', 'SOTA'];

function locate_ref(loc) {
	if (loc != prevloc) {
		let url = sotaapp2 + "/search/brief?name=" + loc;
		fetch(url)
			.then(res => res.json())
			.then(data => {
				let r = data['candidates'][0];
				showReference({
					coord: [r['lat'], r['lon']],
					name: r['name'],
					code: r['code'],
				})
			});
		prevloc = loc;
	}
}

function label_callback(item, data) {
	locate_ref(item.raw['code']);
	return item.raw['z'];
}

function onProgChange(prog) {
	let drop = document.getElementById('program_dropdown');
	let prev_prog = target_prog;

	if (prog == 0) {
		drop.textContent = 'SOTA/POTA';
		target_prog = ['POTA', 'SOTA'];

	} else if (prog == 1) {
		drop.textContent = 'SOTA';
		target_prog = ['SOTA'];

	} else if (prog == 2) {
		drop.textContent = 'POTA';
		target_prog = ['POTA'];
	}
	if (prev_prog != target_prog) {
		refresh_spots();
	}

}

function onPeriodChange(p) {
	let drop = document.getElementById('period_dropdown');
	drop.textContent = 'Last ' + String(p) + 'H';
	if (prefs['spot_period'] != p) {
		prefs['spot_period'] = p;
		closePrefs();
	}
}

async function stat_db() {
	let url = sotaapp2 + '/pota/log-stat';
	let res = await fetch(url);
	let hist = await res.json();

	let ctx = document.getElementById('myLogStat').getContext('2d');
	let cnt = document.getElementById('stat-container');

	ctx.canvas.height = 320;
	cnt.style.height = ctx.canvas.height + 40;
	ctx.canvas.width = 320;
	cnt.style.width = ctx.canvas.width + 40;

	let labels = []
	let users = []
	let logsizes = []

	for (const l of hist['log_history']) {
		labels.push(new Date(l['time']));
		users.push(l['users']);
		logsizes.push(l['logs']);
	};

	if (chart2) {
		chart2.destroy();
	}

	chart2 = new Chart(ctx, {
		data: {
			labels: labels,
			datasets: [
				{
					type: 'bar',
					label: 'Uploaded logs',
					data: users,
					borderColor: "rgba(254,97,132,0.8)",
					backgroundColor: "rgba(254,97,132,0.5)",
					yAxisID: "y",
				},
				{
					type: 'bar',
					label: 'Total log entries',
					data: logsizes,
					borderColor: "rgba(54,164,235,0.8)",
					backgroundColor: "rgba(54,164,235,0.5)",
					yAxisID: "y1",
				}
			]
		},
		options: {
			responsive: true,
			scales: {
				x: {
					type: 'time',
					time: {
						unit: 'day',
						stepsize: 1,
						displayFormats: {
							'day': 'MM/dd',
						},
					},
				},
				y1: {
					display: true,
					position: 'right',
					stepSize: 1000,
					grid: {
						drawOnChartArea: false,
					},
				},
				y: {
					display: true,
					position: 'left',
					stepSize: 10,
				},
			}
		},
	});
	chart2.update();
	let etime = "Query with " + hist['longest_entry'] + "entries took " + hist['query_latency'] + "ms.";
	document.getElementById("perf_mon").innerHTML = etime;
}


var aprs_layer = null;
function drawAPRSTrack(prop, track) {
	let coords = track['coordinates'],
		ssid = prop['ssid'],
		callsign = prop['callsign'],
		lastseen = new Date(prop['lastseen']),
		distance = prop['distance'],
		summit = prop['summit'],
		spot_summit = prop['spot_summit']
	spot_time = prop['spot_time'],
		spot_freq = prop['spot_freq'],
		spot_mode = prop['spot_mode'],
		spot_comment = prop['spot_comment'];

	let actopt = {
		month: "numeric", day: "numeric",
		hour: "numeric", minute: "numeric"
	},
		spotopt = { hour: "numeric", minute: "numeric" };

	lastseen = lastseen.toLocaleString('en-us', actopt);

	if (spot_time) {
		spot_time = new Date(spot_time);
		spot_time = spot_time.toLocaleString('en-us', spotopt);
	} else
		spot_time = "";

	L.polyline(coords, { color: '#0d47a1', opacity: 0.4, weight: 4 }).addTo(aprs_layer);

	for (const latlng of coords)
		L.circleMarker(latlng, { color: '#ff1744', radius: 2 }).addTo(aprs_layer)

	if (ssid == '5' || ssid == '7') {
		options = {
			prefix: 'icon'
			, icon: 'user outline'
			, shape: 'star'
			, markerColor: 'yellow'
			, extraClasses: 'semantic-ui-custom'
		};
	}
	else if (ssid == '9') {
		options = {
			prefix: 'icon'
			, icon: 'car'
			, shape: 'star'
			, markerColor: 'yellow'
			, extraClasses: 'semantic-ui-custom'
		};
	} else {
		options = {
			prefix: 'icon'
			, icon: 'home'
			, shape: 'star'
			, markerColor: 'yellow'
			, extraClasses: 'semantic-ui-custom'
		};
	}

	let marker = L.marker(coords[coords.length - 1],
		{ icon: L.ExtraMarkers.icon(options) });
	// スポットのコメントなどは誰でも書ける(SOTAwatch・APRS)ので、すべてエスケープする
	let message = '<b>' + escapeHTML(lastseen) + ' ' + escapeHTML(callsign) + ' (' + escapeHTML(distance) + 'm from ' + escapeHTML(summit) + ')</b>';

	if (spot_time && parseInt(distance) < 500)
		message += '<br><center>' + escapeHTML(spot_time) + ' ' + escapeHTML(spot_freq) + ' ' + escapeHTML(spot_mode) + ' ' + escapeHTML(spot_summit) + '<br>' + escapeHTML(spot_comment) + '</center>'

	marker.bindPopup(message).openPopup();
	marker.addTo(aprs_layer);
}

async function refresh_aprs_track() {

	if (prefs['aprs_track']) {
		if (aprs_layer) {
			map.removeLayer(aprs_layer);
			aprs_layer = L.layerGroup();
		} else
			aprs_layer = L.layerGroup();
	} else {
		if (aprs_layer)
			map.removeLayer(aprs_layer);
		return;
	}

	map.addLayer(aprs_layer);

	let range = '24';
	let api = sotaapp2 + '/activation/aprs/track?pat_ref=JA&hours_ago=' + range;

	let res = await fetch(api);
	if (!res.ok) {
		console.warn('aprs/track:', res.status);
		return;
	}
	res = await res.json();
	let tracks = res['tracks'];
	for (const track of tracks) {
		drawAPRSTrack(track['properties'], track['geometry']);
	}
}

async function refresh_spots() {
	const pat = encodeURIComponent("^(JA|JP-)");
	let api = sotaapp2 + '/activation/spots?pat_ref=' + pat;
	if (prefs['pota_hunter_uuid'] != null) {
		api += '&log_id=' + prefs['pota_hunter_uuid'];
	}
	if (prefs['by_call']) {
		api += '&by_call=null';
	} else {
		api += '&by_ref=null';
	}
	api += '&hours_ago=' + String(prefs['spot_period']);

	let res = await fetch(api);
	res = await res.json();
	let sdata = res;
	let datasets = [];
	let radius = 0;
	let rc = 0;

	for (let prog of target_prog) {
		for (var i = 0; i < sdata.length; i++) {
			let ref = sdata[i]['key'];
			let spots = sdata[i]['values'];
			let sp = [];
			if (spots[0]['program'] == prog) {
				let qsos = spots[0]['qsos'];

				for (const p of spots) {
					sp.push(
						{
							x: new Date(p['spotTime']),
							y: rc,
							z: p['activator'] + " " + p['reference'] + " " + p['frequency'] + " " + p['mode'] + " " + p['comment'],
							ref: ref,
							code: p['reference']
						})
				}

				if (prefs['by_call'] || prog == 'SOTA' ||
					!prefs['show_potalog'] || qsos != null) {
					d = {
						label: ref,
						pointRadius: 5,
						data: sp
					};
				}
				else {
					d = {
						label: ref,
						pointRadius: 8,
						pointBoderWidth: 4,
						data: sp
					};
				}
				datasets.push(d)
				rc += 1;
			}
		}
	}
	document.getElementById('spot-notice').style.display =
		(!SOTA_SPOTS_AVAILABLE && target_prog.includes('SOTA')) ? '' : 'none';
	document.getElementById('spot-empty').style.display = datasets.length == 0 ? '' : 'none';

	let ctx = document.getElementById('myChart').getContext('2d');
	let cnt = document.getElementById('chart-container');

	ctx.canvas.height = rc * 20 + (rc / 3 + 1) * 30;
	cnt.style.height = ctx.canvas.height + 40;

	if (chart) {
		chart.destroy();
	}
	let now = new Date();
	let spot_from = new Date(now.getTime() - prefs['spot_period'] * 1000 * 3600);
	let spot_to = new Date(now.getTime() + 300 * 1000);

	chart = new Chart(ctx, {
		type: 'line',

		data: {
			datasets: datasets
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			layout: {
				padding: {
					left: 20,
					right: 20,
				}
			},
			plugins: {
				legend: {
					position: 'top',
					reverse: true,
				},
				tooltip: {
					backgroundColor: "rgba(19, 58, 95, 09)",
					xPading: 10,
					yPadding: 10,
					callbacks: {
						label: label_callback,
					},
				},
				customCanvasBackgroundColor: {
					color: 'white',
				}
			},
			scales: {
				x: {
					type: 'time',
					time: {
						unit: 'hour',
						displayFormats: {
							'hour': 'MM/dd HH:mm',
						},
					},
					max: spot_to,
					min: spot_from,
				},
				y: {
					display: false,
				},
			}
		},
		plugins: [plugin],
	});
	chart.update();
}

onPeriodChange(prefs['spot_period']);

var aprs_timer_id = null;
var spot_timer_id = null;

$('#spots-data').on('show.bs.modal', function (e) {
	refresh_spots();
	spot_timer_id = setInterval(refresh_spots, 60000);
});

$('#spots-data').on('hide.bs.modal', function (e) {
	if (spot_timer_id)
		clearInterval(spot_timer_id);
});

$('#logs-data').on('show.bs.modal', function (e) {
	stat_db();
});

$('#pemuact').on('hide.bs.modal', function (e) {
	clickPrefs();
});

refresh_aprs_track();
aprs_timer_id = setInterval(refresh_aprs_track, 180000);

	
