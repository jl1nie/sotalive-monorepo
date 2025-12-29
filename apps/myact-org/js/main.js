/* MyACT Main Initialization */

// Initialize Cookie preferences
readCookie(prefs);

// Initialize GeoJSON
updateGeoJson();

// Initialize timers
kp_index();
setInterval(kp_index, 1000 * 1800);
clock();
setInterval(clock, 5000);

// Map event handlers
map.on('click', function (e) {
	displayPopup({}, e.latlng, false, false);
});

map.on('dragend', function (e) {
	userChange = true
})

map.on('zoomend', function (e) {
	userChange = true
})

map.on('moveend', function (e) {
	if (userChange) {
		userChange = false;
		redrawMarkers();
	}
});

// Initialize geolocation
initGeolocation();

// Initialize spot period display
onPeriodChange(prefs['spot_period']);

// Modal event handlers
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

// Initialize APRS tracking
refresh_aprs_track();
aprs_timer_id = setInterval(refresh_aprs_track, 180000);

// Initialize search input
$("#search_ref").searchinput({ width: 65, done: function (s) { showReference(s) } });
