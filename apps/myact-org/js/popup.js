/* MyACT Popup Functions */

function redrawPopup() {
	if (last_area != null) {
		var ctnt = '<b>' + selectRef(last_area, true) + '</b>' + last_mesg;
		popup.setContent(ctnt);
		popup.update();
	}
}

function keyerButton(area) {
	let arg = '{';
	for (var k in area)
		arg += k + ':' + "'" + area[k] + "',";
	arg += '}'
	let bstr = '<center><button type="button" class="btn-outline-primary btn-sm" data-toggle="modal" data-target="#pemuact" onclick="clickPemuAct(' + arg + ')"><img src="svg/clipboard.svg"></button></center>';
	return bstr;
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
		area['pota'] = replacePOTAref(area['pota']);
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
					pos = '<br>位置:<a href="' + locURI(s['latitude'], s['longitude'], z) +
						'" target="_blank">' + s['latitude'] + ',' + s['longitude'] + '</a>';
					sotamesg = escapeStr(s['cityJ']) + '<br>GL:' + s['maidenhead'] + pos + '<br>標高:' + s['altM'] + 'm,' + s['points'] + 'pts (+' + s['bonusPoints'] + ')';
					qsomesg += '<br>Activations: ' + s['activationCount']
					if (s['activationCount'] != 0)
						qsomesg += '<br>Last Activation: ' + s['activationDate'] + '(' + s['activationCall'] + ')';
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
							qsomesg = "<br>Activations/Attempts: " + p['activations'] + "/" + p['attempts']
							qsomesg += "<br>QSOs: " + p['qsos'] + "<br>";
						} else if (p['qsos'] != null)
							qsomesg = "<br>QSOs: " + p['qsos'] + "<br>";
					}
				}
			}
			local_reverse_geocoder(latlng.lat, latlng.lng, true)
				.then(res => {
					if ('elevation' in res) {
						if ('alt' in latlng) {
							altitude = res['elevation'] + 'm (GPS測位値:' + latlng.alt + 'm)';
						} else {
							altitude = res['elevation'] + 'm';
						}
					} else
						altitude = '---';

					if (res['errors'] == 'OUTSIDE_JA') {
						mesg = 'Pos: ' + lat + ',' + lng + '<br>GL: ' + res['maidenhead'];
					}
					else if (res['errors'] != 'OK') {
						mesg = 'Parameter out of range.';
					} else {
						accu = '<small>[' + res['hsrc'].replace('（', '').replace('）', '') + ']</small>'

						if (isGPS)
							pos = '<br>位置:<a href="' + locURI(lat, lng, z) +
								'" target="_blank">' + lat + ',' + lng + '</a>';
						else
							pos = '<i><br>位置:<a href="' + locURI(lat, lng, z) +
								'" target="_blank">' + lat + ',' + lng + '</a></i>';

						if (res['jccCode'] != null) {

							if (res['wardCode'] != null) {
								area['century'] = 'JCC ' + res['wardCode'];
								mesg = 'JCC' + res['jccCode'] + ' 区番号:' + res['wardCode'] + '<br>' +
									res['prefecture'] + res['municipality'] + '<br>GL:' + res['maidenhead'] +
									pos + '<br> 標高:' + altitude;
							}
							else {
								area['century'] = 'JCC ' + res['jccCode']
								mesg = 'JCC' + res['jccCode'] + '<br>' + res['prefecture'] + res['municipality'] +
									'<br>GL:' + res['maidenhead'] + pos + '<br> 標高:' + altitude;
							}
						}
						else {
							area['century'] = 'JCG ' + res['jcgCode'] + res['hamlogCode'];
							mesg = 'JCG' + res['jcgCode'] + res['hamlogCode'] + '<br>' + res['prefecture'] + res['jcgText'] +
								res['municipality'] + '<br>GL:' + res['maidenhead'] + pos + '<br> 標高:' + altitude;
						}
					}

					function cont(mapcode) {
						weather = '&nbsp&nbsp<a href="' + windyuri +
							'" target="_blank"><img src="svg/sun.svg"><img src="svg/cloud.svg"><img src="svg/rain.svg"></a>';

						if (mapcode)
							weather += '<br><img src="img/mc_long.jpg" height=14px> &nbsp' + mapcode;

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

					if (prefs['display_mapcode']) {
						get_mapcode(latlng.lat, latlng.lng)
							.then(code => {
								cont(code)
							})
					}
					else
						cont('')
				});
		});
}
