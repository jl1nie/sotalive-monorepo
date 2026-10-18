/* MyACT POTA Log Functions */

async function potaLog(command) {
	let keys = ['pota_activator_uuid', 'pota_hunter_uuid'];
	let res = null;
	let api = '/pota';
	switch (command) {
		case 'check':
			for (var k of keys) {
				var el, mesg;

				if (prefs[k] == null) {
					el = document.getElementById(k);
					el.innerText = '----';
					continue;
				}

				res = await fetchAPI(api + `/log/${prefs[k]}`, 'GET');

				if (res) {
					prefs[k] = res['logId'];
					el = document.getElementById(k);
					if (k.includes('hunter')) {
						mesg = '(Hunter)';
					} else {
						mesg = '(Activator)';
					}
					el.innerText = res['lastUpdate'] + mesg;
				} else {
					prefs[k] = null;
					el = document.getElementById(k);
					el.innerText = '----';
				}
			}
			break;

		case 'del-act':
			k = 0;

		case 'del-hunt':
			if (command.includes('hunt'))
				k = 1;

			if (prefs[keys[k]] == null)
				break;

			res = await fetchAPI(api + `/log/${prefs[keys[k]]}`, 'DELETE');

			if (res) {
				prefs[keys[k]] = null;
				el = document.getElementById(keys[k]);
				el.innerText = '----';
				if (k == 0)
					potaLog('show-hunt');
				else
					potaLog('show-act');
			}

			potaLog('check');

			break;

		case 'show-act':
			prefs['show_potalog'] = true;
			prefs['show_potaactlog'] = true;

			el = document.getElementById('show_potaactlog');
			el.checked = true;

			el = document.getElementById('show_potalog');
			el.checked = true;

			break;

		case 'show-hunt':
			prefs['show_potalog'] = true;
			prefs['show_potaactlog'] = false;

			el = document.getElementById('show_potaactlog2');
			el.checked = true;

			el = document.getElementById('show_potalog');
			el.checked = true;

			break;

		case 'upload':
			const file_input = document.getElementById('file_input');

			if (file_input.files.length == 0) {
				window.alert("ファイルを指定してください");
				return
			}

			const fd = new FormData();
			fd.append('uploadfile', file_input.files[0]);

			res = await fetchAPI(api + `/log/${prefs[keys[0]]}/${prefs[keys[1]]}`, 'POST', fd);

			if (res) {
				if (res['logKind'] == 'activator') {
					prefs[keys[0]] = res['logId'];
					potaLog('show-act');
				}
				else {
					prefs[keys[1]] = res['logId'];
					potaLog('show-hunt');
				}
				potaLog('check');
			} else {
				mesg =
					"不正なログファイルの形式です\n" +
					"POTA.appからダウンロードしたCSVファイルをアップロードして下さい";
				window.alert(mesg);
			}
			break;

		case 'export':
			res = await fetchAPI(api + `/log-share/${prefs[keys[0]]}/${prefs[keys[1]]}`, 'GET');

			if (res) {
				el = document.getElementById('pota_export_key');
				el.innerHTML = '<b>' + res['share_id'] + '</b>';
			} else {
				window.alert("Exportに失敗しました")
			}
			break;

		case 'import':
			const sharekey = document.getElementById('import_uuid');
			res = await fetchAPI(api + `/log-share/${sharekey.value}`, 'GET');

			if (res) {
				prefs[keys[0]] = res['activator_logid'];
				prefs[keys[1]] = res['hunter_logid'];
				potaLog('check');

				if (res['activator_logid'] != null)
					potaLog('show-act')

				if (res['hunter_logid'] != null)
					potaLog('show-hunt')

			} else {
				window.alert("キーコードが見つかりません")
			}
			break;

		default:
			console.log("Unknown command" + command);
			break;
	}
}
