/* MyACT Configuration */

var prefs = {
	'popup_permanent': true,
	'display_mapcode': false,
	'link_googlemap': false,
	'by_call': false,
	'sota_ref': true,
	'pota_ref': true,
	'jaff_ref': true,
	'display_area': false,
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

var sotaapp2 = 'https://sotaapp2.sotalive.net/api/v2';
var show_summit_marker = [];
var enable_experimental = false;
var tolerance;
var gsi_attribution;

// Experimental features check
if (location.host != 'mypilgrim.sotalive.net') {
	enable_experimental = false;
	prefs['display_area'] = false;
	document.getElementById('check-pilgrim').style.display = 'none';
	document.getElementById('check-display_area').style.display = 'none';
} else {
	enable_experimental = true;
	document.getElementById('check-pilgrim').style.display = 'block';
	document.getElementById('check-display_area').style.display = 'block';
}

// Mobile detection
if (navigator.userAgent.match(/iPhone|Android.+Mobile/)) {
	tolerance = 30;
} else {
	tolerance = 5;
}

// Viewport height
let vh = window.innerHeight * 0.01;
document.documentElement.style.setProperty('--vh', `${vh}px`);
window.addEventListener('resize', () => {
	let vh = window.innerHeight * 0.01;
	document.documentElement.style.setProperty('--vh', `${vh}px`);
});

// Attribution
if (use_yahoo_revgeocode) {
	gsi_attribution = "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>|<a href='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A10-v4_1.html' target='_blank'>国土数値情報自然公園地域データ</a>|<a href='https://developer.yahoo.co.jp/sitemap/'>Web Services by Yahoo! JAPAN</a>";
} else {
	gsi_attribution = "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>|<a href='https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A10-v4_1.html' target='_blank'>国土数値情報自然公園地域データ</a>";
}
