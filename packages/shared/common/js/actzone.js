function latlonToPxl(lat, lon, zoom) {
    const Lmax = 85.05112878;
    var px = parseInt(Math.pow(2, zoom + 7) * (lon / 180 + 1))
    var tx = parseInt(px / 256)
    var py = parseInt((Math.pow(2, zoom + 7) / Math.PI) * ((-1 * Math.atanh(Math.sin((Math.PI / 180) * lat))) + Math.atanh(Math.sin((Math.PI / 180) * Lmax))))
    var ty = parseInt(py / 256)
    return {px:px,tx:tx,py:py,ty:ty}
}

function pxlTolatlon(px, py, zoom) {
    const Lmax = 85.05112878;
    var lon = 180 * (px / Math.pow(2, zoom + 7) - 1);
    var lat = (180 / Math.PI) * (Math.asin(Math.tanh((-1 * Math.PI / Math.pow(2, zoom + 7) * py) + Math.atanh(Math.sin(Math.PI / 180 * Lmax)))));
    return {lat:lat, lon:lon}
}

var ContourLayer = L.GridLayer.extend({
    initialize: function(pxl, zoom, elevation, cmap, uplmt,
			 vdist, hdist, options) {
        L.Util.setOptions(this, options);
	this._elevation = elevation;
	this._pX = pxl['px']
	this._tX = pxl['tx']
	this._pY = pxl['py']
	this._tY = pxl['ty']
	this._upperlimit = uplmt;
	this._vdist = vdist;
	this._hdist = hdist;
	this._region = new RegionFill2(this._tX, this._tY,
				      this._pX, this._pY,
				      cmap,hdist);
	this._cmap = cmap;

    },

    createTile: function(coords, done) {
        var canvas = L.DomUtil.create("canvas", "leaflet-tile");
        canvas.width = 256;
        canvas.height = 256;

	var pX = this._pX;
	var pY = this._pY;
	var tX = this._tX;
	var tY = this._tY;
	var region = this._region;
	var cmap = this._cmap;
	var uplmt = this._upperlimit;
	var hdist = this._hdist;
	var vdist = this._vdist;
	
	if (Math.abs(coords['x'] - tX) > hdist ||
	    Math.abs(coords['y'] - tY) > hdist )
	    return canvas;

        var elev = this._elevation;
	getDEM(coords,function(e) {
            var dem = e.map(function(a) {
		return (elev - a) / vdist;
            });
            var ctx = canvas.getContext("2d");
            var img = ctx.createImageData(0x100, 0x100);
            for (var i = 0; i <= 0xffff; i++) {
		if (dem[i] < 1){
		    if (dem[i] < uplmt)
			img.data[i * 4 + 3] = cmap[1].opaque;
		    else
			img.data[i * 4 + 3] = cmap[0].opaque;
		    img.data[i * 4 + 0] = 0x00;
		    img.data[i * 4 + 1] = 0x00;
		    img.data[i * 4 + 2] = 0x00;
		}
	    }
	    region.fillTile(ctx,img, coords['x'],coords['y'])
            if (done) done(null, canvas);
        });
        return canvas;
    }
});

// 山頂の画素(タイル内 px, py)の ±3 画素で最も高い画素を探す。demAt(dx, dy) は、山頂のタイルから
// dx, dy だけ離れたタイルの標高(長さ 65536)を返す。探す範囲がタイルの端を越えたら隣のタイルを読む
// (以前はタイルの中の添字で探していたので、左右の端では隣の行の反対側の画素を読んでいた)。
function findPeak(px, py, demAt) {
    var peak = 0, cx = px, cy = py, moved = false;
    for (var i = -3; i < 4; i++)
	for (var j = -3; j < 4; j++) {
	    var x = px + i, y = py + j;
	    var e = demAt(Math.floor(x / 256), Math.floor(y / 256));
	    if (!e)
		continue;
	    var h = e[(((y % 256) + 256) % 256) * 256 + ((x % 256) + 256) % 256];
	    if (h > peak) {
		cx = x;
		cy = y;
		peak = h;
		moved = true;
	    }
	}
    return {peak: peak, cx: cx, cy: cy, moved: moved};
}

L.contourLayer = function(lat, lon, zoom, height, uplmt, vdist, hdist ,options,done) {
    if (zoom > 14)
	zoom = 14
    var pxl = latlonToPxl(lat,lon,zoom)
    var px = pxl['px'] % 256,
	py = pxl['py'] % 256;
    // 探す範囲にかかるタイル(普通は山頂のタイルだけ。端では隣も)
    var need = {};
    for (var i = -3; i < 4; i += 6)
	for (var j = -3; j < 4; j += 6) {
	    var dx = Math.floor((px + i) / 256), dy = Math.floor((py + j) / 256);
	    need[dx + ',' + dy] = [dx, dy];
	}
    Promise.all(Object.keys(need).map(k => new Promise(resolve =>
	getDEM({x: pxl['tx'] + need[k][0], y: pxl['ty'] + need[k][1], z: zoom}, e => resolve([k, e]))
    ))).then(list => {
	var dems = {};
	list.forEach(r => { dems[r[0]] = r[1]; });
	var r = findPeak(px, py, (dx, dy) => dems[dx + ',' + dy]);
	// 塗り始めは最高点の画素。最高点が隣のタイルにあれば、そのタイルを中心にする
	pxl['px'] = pxl['tx'] * 256 + r.cx
	pxl['py'] = pxl['ty'] * 256 + r.cy
	pxl['tx'] = Math.floor(pxl['px'] / 256)
	pxl['ty'] = Math.floor(pxl['py'] / 256)
	var latlon = pxlTolatlon(pxl['px'],pxl['py'],zoom)
	if (done)
	    done(new ContourLayer(pxl, zoom, r.peak,
				  [{opaque:0x01,
				    color:[0xff,0x00,0x00,0x60]},
				   {opaque:0x02,
				    color:[0x00,0x00,0xff,0x60]}],
				  uplmt,
				  vdist, hdist, options),latlon,r.moved)
    })
}

var activation_zone = null;
var _azone_laststate = null;

function displayActivationZone(latlng, uplmt) {
    var lat = latlng.lat;
    var lng = latlng.lng;
    var vdist = 25;
    var hdist = 8;
    var zoom = map.getZoom();

    _azone_laststate = [ latlng, uplmt ]
    local_get_elevation(lat, lng)
	.then(res => {
	if (res['errors'] != 'OK') {
	    console.log('DEM error',res['errors']);
	    return;
	}
	else {
	    L.contourLayer(lat, lng, zoom, res['elevation'], uplmt, vdist, hdist,{
		attribution: "<a href='https://little-ctc.com/sota_hp/' target='_blank'>JCC/JCGデータ</a>",
		minZoom: 14,
		maxZoom: 18,
		maxNativeZoom: 14
	    },function (l,latlon,moved) {
		if (map && activation_zone) 
		    map.removeLayer(activation_zone);
		activation_zone = l
		l.addTo(map)
	    })
	}
	});
}

function redoActivationZone() {
    if (_azone_laststate) {
	var latlng = _azone_laststate[0],
	    uplmt = _azone_laststate[2],
	    b = map.getBounds();
	if (latlng.lat > b['_northEast']['lat'] || latlng.lat < b['_southWest']['lat'])
	    return
	if (latlng.lng > b['_northEast']['lng'] || latlng.lng < b['_southWest']['lng'])
	    return

	displayActivationZone(latlng, uplmt)
    }
}


if (typeof module !== 'undefined')
    module.exports = { findPeak: findPeak, latlonToPxl: latlonToPxl };
