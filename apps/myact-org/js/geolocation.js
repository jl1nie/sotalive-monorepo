/* MyACT Geolocation Functions */

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
			emesg = "位置情報の利用が許可されていません";
			break;
		case 2:
			emesg = "端末位置がわかりませんでした";
			break;
		case 3:
			emesg = "タイムアウトしました";
			break;
	}
	window.alert(emesg);

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
	}

	var options = {
		"enableHighAccuracy": true,
		"timeout": 10000,
		"maximumAge": 0
	}
	navigator.geolocation.getCurrentPosition(callbkQTHOk, callbkQTHNG, options);
};

function initGeolocation() {
	// 位置情報の許可状態を確認してから自動取得
	if (navigator.permissions && navigator.permissions.query) {
		navigator.permissions.query({ name: 'geolocation' }).then(function(result) {
			if (result.state === 'granted') {
				// 既に許可されている場合のみ自動取得
				clickQTHButton();
			} else {
				// 未許可の場合はデフォルト位置を表示
				map.setView([37.514444, 137.712222], 6);
			}
		}).catch(function() {
			// permissions API非対応の場合はデフォルト位置
			map.setView([37.514444, 137.712222], 6);
		});
	} else {
		// permissions API非対応の場合はデフォルト位置
		map.setView([37.514444, 137.712222], 6);
	}
}
