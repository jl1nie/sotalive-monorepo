const endpoint = {
    'revgeocode':'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress',
    'revyahoo':'https://www.sotalive.net/api/reverse-geocoder/LonLatToAddressMapCode',
    'elevation':'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php',
    'muni' : 'https://www.sotalive.net/api/reverse-geocoder/LonLatMuniToAddress',
};

const cache_rev = new Map();

var use_yahoo_revgeocode = true;
var enable_gsi_elevation = false;

async function local_reverse_geocoder(lat, lng, elev) {
    if (use_yahoo_revgeocode)
	return local_reverse_geocoder_yahoo(lat, lng, elev)
    else
	return local_reverse_geocoder_gsi(lat, lng, elev)

}

async function local_reverse_geocoder_gsi(lat, lng, elev) {
    let pos = '?lat=' + String(lat) + '&lon=' + String(lng);

    if (cache_rev.has(pos)) {
	return cache_rev.get(pos);
    }

    if (cache_rev.size >= 16) {
	const oldest = cache_rev.keys().next().value;
	cache_rev.delete(oldest);
    }
    
    let rev_uri = endpoint['revgeocode'] + pos
    let elev_uri = endpoint['elevation'] + pos + '&outtype=JSON'
    let res_elev = null;

    if (elev) 
	res_elev = local_get_elevation(lat, lng);

    let res = await fetch(rev_uri);
    res = await res.json();

    let muni_uri =
	endpoint['muni'] + pos;
    
    if ('results' in res) 
	muni_uri += '&muni=' + res['results']['muniCd'];
    	muni_uri += '&addr=' + res['results']['lv01Nm'];

    let res2 = await fetch(muni_uri);
    let result = await res2.json()

    if (result['errors'] == 'OK') {
	result['addr1'] = res['results']['lv01Nm'];
	if (elev) {
	    const p_elev =  res_elev
		  .then(res => {
		      result['elevation'] = res['elevation']
		      result['hsrc'] = res['hsrc']
		      if (res['elevation'] == '-----')
			  result['errors'] = 'OUTSIDE_JA';
		      return Promise.resolve(result);});
	    cache_rev.set(pos, p_elev);
	    return p_elev;
	} else {
	    const p_pos = Promise.resolve(result);
	    cache_rev.set(pos, p_pos);
	    return p_pos;
	}
    } else {
	const p_err = Promise.resolve({'errors': 'OUTSIDE_JA',
				       'maidenhead': result['maidenhead']});
	cache_rev.set(pos, p_err);
	return p_err;
    }
}

async function local_reverse_geocoder_yahoo(lat, lng, elev) {
    let pos = '?lat=' + String(lat) + '&lon=' + String(lng);

    if (cache_rev.has(pos)) {
	return cache_rev.get(pos);
    }

    if (cache_rev.size >= 16) {
	const oldest = cache_rev.keys().next().value;
	cache_rev.delete(oldest);
    }
    
    let rev_uri = endpoint['revyahoo'] + pos
    let elev_uri = endpoint['elevation'] + pos + '&outtype=JSON'
    let res_elev = null;

    if (elev && enable_gsi_elevation) 
	res_elev = local_get_elevation(lat, lng);

    let res = await fetch(rev_uri);
    result = await res.json();

    if (result['errors'] == 'OK') {
	if (elev) {
	    if (enable_gsi_elevation) {
		const p_elev =  res_elev
		      .then(res => {
			  result['elevation'] = res['elevation']
			  result['hsrc'] = res['hsrc']
			  if (res['elevation'] == '-----')
			      result['errors'] = 'OUTSIDE_JA';
			  return Promise.resolve(result);});
		cache_rev.set(pos, p_elev);
		return p_elev;
	    } else {
		result['elavation'] = '-----';
		result['hsrc'] = '-----';
		const p_err = Promise.resolve(result);
		cache_rev.set(pos, p_err);
		return p_err;
	    }
	} else {
	    const p_pos = Promise.resolve(result);
	    cache_rev.set(pos, p_pos);
	    return p_pos;
	}
    } else {
	const p_err = Promise.resolve({'errors': 'OUTSIDE_JA',
				       'maidenhead': result['maidenhead']});
	cache_rev.set(pos, p_err);
	return p_err;
    }
}

const cache_elev = new Map();

async function local_get_elevation(lat, lng) {
    let pos = '?lat=' + String(lat) + '&lon=' + String(lng);
    let result = {};
    
    if (cache_elev.has(pos)) {
	return cache_elev.get(pos);
    }

    if (cache_elev.size >= 16) {
	const oldest = cache_elev.keys().next().value;
	cache_elev.delete(oldest);
    }
    
    let elev_uri = endpoint['elevation'] + pos + '&outtype=JSON';
    let res_elev = fetch(elev_uri)
	.then(res => {
	    if (!res.ok) {
		throw new Error(res.status)
	    } else 
		return res.json()
	})
	.then(res => {
	    result['elevation'] = res['elevation']
	    result['hsrc'] = res['hsrc']
	    if (res['elevation'] == '-----')
		result['errors'] = 'OUTSIDE_JA';
	    else
		result['errors'] = 'OK';
	    return result;
	})
	.catch(error => {
	    console.log(error);
	    result['elevation'] = '-----';
	    result['errors'] = 'OUTSIDE_JA';
	    return result;
	});
    
    cache_elev.set(pos,res_elev);
    
    return res_elev;
}

