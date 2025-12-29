/* MyACT Marker Functions */

var _popupMarker = null;
var qth_marker = null;
var userChange = true;

function deleteSummitMarker() {
	while (show_summit_marker.length > 0) {
		var m = show_summit_marker.pop()
		map.removeLayer(m)
	}
}

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
		.then(res => res.json())
		.then(res => {

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
		pota: replacePOTAref(parks['pota']),
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
}

function showReference(s) {
	latlng = s['coord']

	map.setView(latlng, 15);
	if (s['code'].match(/JA\d*\/.+/)) {
		displayPopup({}, { 'lat': s['coord'][0], 'lng': s['coord'][1] }, false, false);
	}
	redrawMarkers();
}
