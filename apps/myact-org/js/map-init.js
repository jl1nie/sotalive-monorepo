/* MyACT Map Initialization */

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

// TopoJSON Extension
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

geojson.addTo(map);

async function getGeoData(url) {
	let response = await fetch(url);
	let data = await response.json();
	return data;
}

function updateGeoJson() {
	if (enable_experimental || prefs['display_area']) {
		getGeoData('json/jaffpota-annotated-v22.json').then(data => geojson.addData(data));
	} else {
		geojson.clearLayers()
	}
}
