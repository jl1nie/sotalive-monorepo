let vh = window.innerHeight * 0.01;
document.documentElement.style.setProperty('--vh', `${vh}px`);
window.addEventListener('resize', () => {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
});

if (use_yahoo_revgeocode) {
    gsi_attribution = "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>|<a href='https://developer.yahoo.co.jp/sitemap/'>Web Services by Yahoo! JAPAN</a>"
} else {
    gsi_attribution = "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>"
}

var osm = L.tileLayer('https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=767750c193e54ceeb3aee08d880bdb90', {
    attribution: "<a href='https://www.thunderforest.com/'>Thunderforest</a>"
});

var gsi = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
    attribution: gsi_attribution
});

var basemap = {
    "GSI": gsi,
    "OSM": osm
}

var map = L.map('map', {
    layers: [gsi]
});
// 位置情報の許可の確認が保留のまま(iPhone の Chrome など)だと、取得の結果が返らず、表示位置が決まらない。
// 地図が出ず、ズームの表示が undefined になるので、先に日本全体を出しておく
map.setView([37.514444, 137.712222], 6);
L.control.scale().addTo(map);
L.control.zoomLabel().addTo(map);
var popup = L.popup();

async function displayPopup(latlng, isMarker, isGPS) {
    var lat = Math.round(latlng.lat * 1000000, 4) / 1000000,
        lng = Math.round(latlng.lng * 1000000, 4) / 1000000,
        gsiuri = 'https://maps.gsi.go.jp/#15/';

    if (isGPS) {
        Cookies.set('my_qth_lat', lat)
        Cookies.set('my_qth_lng', lng)
    }

    var resfun = function (res) {
        // 日本の外やエラーのときも、accu・pos は空で使う(宣言しないと、読むところで ReferenceError)
        var mesg = '', accu = '', pos = '';
        if (res['errors'] == 'OUTSIDE_JA') {
            mesg = 'Pos: ' + lat + ',' + lng + '<br>GL: ' + escapeHTML(res['maidenhead']);
        }
        else if (res['errors'] != 'OK') {
            mesg = 'Parameter out of range.';
        } else {
            accu = res['hsrc'] ? '<small>[' + escapeHTML(res['hsrc'].replace('（', '').replace('）', '')) + ']</small>' : '';

            if (isGPS)
                pos = '<br>位置:<a href="' + gsiuri + latlng.lat + '/' + latlng.lng + '" target="_blank">' + lat + ',' + lng + '</a>';
            else
                pos = '<i><br>位置:<a href="' + gsiuri + latlng.lat + '/' + latlng.lng + '" target="_blank">' + lat + ',' + lng + '</a></i>';

            if (res['jccCode'] != null) {
                if (res['wardCode'] != null)
                    mesg = 'JCC' + escapeHTML(res['jccCode']) + ' 区番号:' + escapeHTML(res['wardCode']) + '<br>' + escapeHTML(res['prefecture']) + escapeHTML(res['municipality']) + '<br>GL:' + escapeHTML(res['maidenhead']) + pos + '<br> 標高:' + escapeHTML(res['elevation']) + 'm';
                else
                    mesg = 'JCC' + escapeHTML(res['jccCode']) + '<br>' + escapeHTML(res['prefecture']) + escapeHTML(res['municipality']) + '<br>GL:' + escapeHTML(res['maidenhead']) + pos + '<br> 標高:' + escapeHTML(res['elevation']) + 'm';
            }
            else
                mesg = 'JCG' + escapeHTML(res['jcgCode']) + escapeHTML(res['hamlogCode']) + '<br>' + escapeHTML(res['prefecture']) + escapeHTML(res['jcgText']) + escapeHTML(res['municipality']) + '<br>GL:' + escapeHTML(res['maidenhead']) + pos + '<br> 標高:' + escapeHTML(res['elevation']) + 'm';
        }

        if (isMarker) {
            mesg = '<h4>' + mesg + '</h4>';
            if (qth_marker != null)
                qth_marker.bindPopup(mesg).openPopup();
        } else {
            popup.setContent(mesg + accu);
            popup.setLatLng(latlng).openOn(map)
        }
    }

    let res = await local_reverse_geocoder(lat, lng, true);
    resfun(res);
}

map.on('click', function (e) {
    displayPopup(e.latlng, false, false);
});

qth_marker = null

function QTHdragend(e) {
    var latlng = e.target.getLatLng();
    map.setView(latlng, 15);
    displayPopup(latlng, true, false);
}

function callbkQTHOk(arg) {

    var latlng = [arg.coords.latitude, arg.coords.longitude],
        options = {
            prefix: 'icon'
            , icon: 'user'
            , shape: 'circle'
            , markerColor: 'yellow'
            , extraClasses: 'semantic-ui-custom'
        };

    map.setView(latlng, 15);

    if (qth_marker != null)
        map.removeLayer(qth_marker)

    qth_marker = L.marker(latlng,
        { draggable: true, icon: L.ExtraMarkers.icon(options) });

    qth_marker.addTo(map);
    displayPopup({ lat: latlng[0], lng: latlng[1] }, true, true);
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

function clock() {
    var now = new Date();
    var tm = now.toString();
    tm = tm.replace(/:\d{2} GMT\+.+/, '');
    document.getElementById("clock_time").innerHTML = tm;
}

map.addLayer(L.layerGroup());
clickQTHButton();
clock();
setInterval(clock, 5000);
