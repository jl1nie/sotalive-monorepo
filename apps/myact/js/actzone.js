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

L.contourLayer = function(lat, lon, zoom, height, uplmt, vdist, hdist ,options,done) {
    if (zoom > 14)
	zoom = 14
    pxl = latlonToPxl(lat,lon,zoom)
    p = getDEM({x:pxl['tx'], y:pxl['ty'], z:zoom},e => {
	var px = pxl['px'] % 256,
	    py = pxl['py'] % 256,
	    peak  = 0,
	    cx = px,cy = py,
	    moved = false;
	
	for (var i = -3; i < 4; i++) 
	    for (var j = -3; j < 4; j++) {
		pos = (py + j) * 256 + px + i
		if (pos >=0 && pos <= 65535)
		    if (e[pos] > peak) {
			cx = px + i
			cy = py + j
			peak = e[pos]
			moved = true
		    }
	    }
	pxl['px'] = pxl['tx']*256+cx
	pxl['py'] = pxl['ty']*256+cy
	latlon = pxlTolatlon(pxl['px'],pxl['py'],zoom)
	if (done)
	    done(new ContourLayer(pxl, zoom, peak,
				  [{opaque:0x01,
				    color:[0xff,0x00,0x00,0x60]},
				   {opaque:0x02,
				    color:[0x00,0x00,0xff,0x60]}],
				  uplmt,
				  vdist, hdist, options),latlon,moved)
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

