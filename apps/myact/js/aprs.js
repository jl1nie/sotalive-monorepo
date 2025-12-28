/* MyACT APRS Track Functions */

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
	let message = '<b>' + lastseen + ' ' + callsign + ' (' + distance + 'm from ' + summit + ')</b>';

	if (spot_time && parseInt(distance) < 500)
		message += '<br><center>' + spot_time + ' ' + spot_freq + ' ' + spot_mode + ' ' + spot_summit + '<br>' + spot_comment + '</center>'

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
	res = await res.json();
	let tracks = res['tracks'];
	for (const track of tracks) {
		drawAPRSTrack(track['properties'], track['geometry']);
	}
}
