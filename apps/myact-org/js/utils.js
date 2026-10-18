/* MyACT Utility Functions */

// 東経→西経変換
function toWestLon(lon) {
	return lon > 180 ? lon - 360 : lon;
}

// 西経→東経変換
function toEastLon(lon) {
	return lon < 0 ? lon + 360 : lon;
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

function replacePOTAref(oldref) {
	return oldref.replace('JA-', 'JP-');
}

function selectRef(area, addhref) {
	var pname = '';

	if (area['pota'] != undefined && area['jaff'] != undefined) {
		if (area['pota'] != '' && prefs['pota_ref']) {
			if (addhref && area['pota'].includes('-'))
				pname = '<a target="_blank" href="https://pota.app/#/park/' + area['pota'] + '">' + area['pota'] + '</a> '
			else
				pname = area['pota'];
			if (area['jaff'] != '' && prefs['jaff_ref']) {
				if (addhref && area['jaff'].includes('-'))
					pname += '/' + '<a target="_blank" href="https://wwff.co/directory/?showRef=' + area['jaff'] + '">' + area['jaff'] + '</a> '
				else
					pname += '/' + area['jaff'];
			}
		} else if (prefs['jaff_ref']) {
			if (addhref)
				pname = '<a target="_blank" href="https://wwff.co/directory/?showRef=' + area['jaff'] + '">' + area['jaff'] + '</a> '
			else
				pname = area['jaff']
		}
	} else if (area['temple'] != undefined && prefs['pilgrim']) {
		pname = area['temple']
	};

	if (area['sota']) {
		sname = '<a target="_blank" href="https://summits.sota.org.uk/summit/' + area['sota_code'] + '">' + area['sota'] + '</a>'

		if (pname == '')
			pname = sname;
		else
			pname = pname + ' ' + sname;
	}

	if (pname != '' && area['name'] != '') {
		pname += '<br>'
		pname += area['name'];
	}

	if (pname != '')
		pname = '<div style="text-align:center">' + pname + '</div>';

	return pname;
}

function getLogID() {
	if (prefs['show_potaactlog'])
		return prefs['pota_activator_uuid'];
	else
		return prefs['pota_hunter_uuid']
}

var geomagindex = 'A:-- K:-';

function kp_index() {
	fetch(sotaapp2 + "/propagation/geomag")
		.then(res => res.json())
		.then(geomag => {
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
