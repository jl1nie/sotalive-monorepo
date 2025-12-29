/* MyACT Keyer/Serial Functions */

var serial_port = undefined;
var serial_writer = undefined;
var serial_reader = undefined;

function clickPemuAct(area) {
	document.getElementById("pemu_name").innerText = area['name'];
	for (k in prefs) {
		if (k.includes('pemu')) {
			let el = document.getElementById(k);
			if (prefs[k])
				el.value = prefs[k];
			else
				el.value = "";
		}
	}
	if (area['sota_code'])
		document.getElementById("pemu_sota").value = area['sota_code'];
	else
		document.getElementById("pemu_sota").value = '';

	if (area['pota'])
		document.getElementById("pemu_pota").value = area['pota'];
	else
		document.getElementById("pemu_pota").value = '';

	if (area['jaff'])
		document.getElementById("pemu_jaff").value = area['jaff'];
	else
		document.getElementById("pemu_jaff").value = '';

	if (area['areacode'])
		document.getElementById("pemu_areacode").value = area['areacode'];
	else
		document.getElementById("pemu_areacode").value = '';

	if (area['century'])
		document.getElementById("pemu_century").value = area['century'];
	else
		document.getElementById("pemu_century").value = '';
}

async function open_serial() {
	const filters = [
		{ usbVendorId: 0x303a, usbProductId: 0x1001 },
		{ usbVendorId: 0x0403, usbProductId: 0x6001 },
		{ usbVendorId: 0x1a86, usbProductId: 0x55d4 },
		{ usbVendorId: 0x10c4, usbProductId: 0xea60 },
	];

	if (! "serial" in navigator) {
		window.alert("お使いのブラウザはシリアル通信が出来ません");
		return;
	}
	if (serial_port == undefined) {
		serial_port = await navigator.serial.requestPort({ filters });
		await serial_port.open({ baudRate: 115200 });
		const textEncoder = new TextEncoderStream();
		const writableStreamClosed = textEncoder.readable.pipeTo(serial_port.writable);
		serial_writer = textEncoder.writable.getWriter();
		serial_reader = serial_port.readable.getReader();
	}
}

async function pemuPressed(num) {
	clickPrefs();
	let msg = prefs["pemu_mesg" + String(num)].toUpperCase();
	let sota = prefs["pemu_sota"].replace('-', '');
	let pota = prefs["pemu_pota"].replace('-', '');
	let jaff = prefs["pemu_jaff"].replace('-', '');
	let areacode = prefs["pemu_areacode"];
	let century = prefs["pemu_century"];
	let wpm = parseInt(prefs["pemu_wpm"], 10);
	let enable_wifi = prefs["enable_wifi"];
	let pemuuri = 'https://' + prefs["pemu_host"] + '/play';
	let jsonmsg = {};

	let call = prefs["pemu_call"];

	if (prefs["include_areacode"] && areacode != "")
		call += '/' + areacode;


	let replaced_msg =
		msg.toUpperCase()
			.replace('$CALL', call)
			.replace('$SOTA', sota)
			.replace('$POTA', pota)
			.replace('$JAFF', jaff)
			.replace('$JCC', century)
			.replace('$JCG', century)

	jsonmsg["wpm"] = wpm;

	if (prefs["to_paddle"])
		jsonmsg["to_paddle"] = replaced_msg;
	else
		jsonmsg["to_straight"] = replaced_msg;

	if (prefs["paddle_reverse"])
		jsonmsg["reverse"] = true;
	else
		jsonmsg["reverse"] = false;

	let jsonstr = JSON.stringify(jsonmsg) + '\r';

	if (navigator.clipboard)
		navigator.clipboard.writeText(replaced_msg);

	if (enable_wifi) {
		console.log(pemuuri);
		await fetch(pemuuri, {
			method: 'POST',
			headers: {
				'Content-Type': 'applicatoin/json'
			},
			body: jsonstr
		})
			.then((res) => {
				if (!res.ok) {
					throw new Error(res.statusText);
				}
			})
			.catch((err) => {
				window.alert('接続エラー: ' + pemuuri + ' (' + err + ')');
			});
	} else {
		await open_serial();
		try {
			await serial_writer.write(jsonstr);
		} catch (err) {
			window.alert('接続エラー: ブラウザをリロードしてください');
		};
		console.log(jsonstr);
		let { value, done } = await serial_reader.read();
		const v = new TextDecoder().decode(value);
		console.log(v);
	}
}
