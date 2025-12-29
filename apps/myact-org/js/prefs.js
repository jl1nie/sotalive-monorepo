/* MyACT Preferences */

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
			Cookies.set(k, String(prefs[k]),
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
			if (ck == "null")
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
	updateGeoJson();
}
