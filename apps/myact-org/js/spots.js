/* MyACT Spots Chart */

const plugin = {
	id: 'customCanvasBackgroundColor',
	beforeDraw: (chart, args, options) => {
		const { ctx } = chart;
		ctx.save();
		ctx.globalCompositeOperation = 'destination-over';
		ctx.fillStyle = options.color || '#99ffff';
		ctx.fillRect(0, 0, chart.width, chart.height);
		ctx.restore();
	}
};

var chart = null;
var chart2 = null;
var prevloc = null;
var target_prog = ['POTA', 'SOTA'];

function locate_ref(loc) {
	if (loc != prevloc) {
		let url = sotaapp2 + "/search/brief?name=" + loc;
		fetch(url)
			.then(res => res.json())
			.then(data => {
				let r = data['candidates'][0];
				showReference({
					coord: [r['lat'], r['lon']],
					name: r['name'],
					code: r['code'],
				})
			});
		prevloc = loc;
	}
}

function label_callback(item, data) {
	locate_ref(item.raw['code']);
	return item.raw['z'];
}

function onProgChange(prog) {
	let drop = document.getElementById('program_dropdown');
	let prev_prog = target_prog;

	if (prog == 0) {
		drop.textContent = 'SOTA/POTA';
		target_prog = ['POTA', 'SOTA'];

	} else if (prog == 1) {
		drop.textContent = 'SOTA';
		target_prog = ['SOTA'];

	} else if (prog == 2) {
		drop.textContent = 'POTA';
		target_prog = ['POTA'];
	}
	if (prev_prog != target_prog) {
		refresh_spots();
	}

}

function onPeriodChange(p) {
	let drop = document.getElementById('period_dropdown');
	drop.textContent = 'Last ' + String(p) + 'H';
	if (prefs['spot_period'] != p) {
		prefs['spot_period'] = p;
		closePrefs();
	}
}

async function stat_db() {
	let url = sotaapp2 + '/pota/log-stat';
	let res = await fetch(url);
	let hist = await res.json();

	let ctx = document.getElementById('myLogStat').getContext('2d');
	let cnt = document.getElementById('stat-container');

	ctx.canvas.height = 320;
	cnt.style.height = ctx.canvas.height + 40;
	ctx.canvas.width = 320;
	cnt.style.width = ctx.canvas.width + 40;

	let labels = []
	let users = []
	let logsizes = []

	for (const l of hist['log_history']) {
		labels.push(new Date(l['time']));
		users.push(l['users']);
		logsizes.push(l['logs']);
	};

	if (chart2) {
		chart2.destroy();
	}

	chart2 = new Chart(ctx, {
		data: {
			labels: labels,
			datasets: [
				{
					type: 'bar',
					label: 'Uploaded logs',
					data: users,
					borderColor: "rgba(254,97,132,0.8)",
					backgroundColor: "rgba(254,97,132,0.5)",
					yAxisID: "y",
				},
				{
					type: 'bar',
					label: 'Total log entries',
					data: logsizes,
					borderColor: "rgba(54,164,235,0.8)",
					backgroundColor: "rgba(54,164,235,0.5)",
					yAxisID: "y1",
				}
			]
		},
		options: {
			responsive: true,
			scales: {
				x: {
					type: 'time',
					time: {
						unit: 'day',
						stepsize: 1,
						displayFormats: {
							'day': 'MM/dd',
						},
					},
				},
				y1: {
					display: true,
					position: 'right',
					stepSize: 1000,
					grid: {
						drawOnChartArea: false,
					},
				},
				y: {
					display: true,
					position: 'left',
					stepSize: 10,
				},
			}
		},
	});
	chart2.update();
	let etime = "Query with " + hist['longest_entry'] + "entries took " + hist['query_latency'] + "ms.";
	document.getElementById("perf_mon").innerHTML = etime;
}

async function refresh_spots() {
	const pat = encodeURIComponent("^(JA|JP-)");
	let api = sotaapp2 + '/activation/spots?pat_ref=' + pat;
	if (prefs['pota_hunter_uuid'] != null) {
		api += '&log_id=' + prefs['pota_hunter_uuid'];
	}
	if (prefs['by_call']) {
		api += '&by_call=null';
	} else {
		api += '&by_ref=null';
	}
	api += '&hours_ago=' + String(prefs['spot_period']);

	let res = await fetch(api);
	res = await res.json();
	let sdata = res;
	let datasets = [];
	let radius = 0;
	let rc = 0;

	for (let prog of target_prog) {
		for (var i = 0; i < sdata.length; i++) {
			let ref = sdata[i]['key'];
			let spots = sdata[i]['values'];
			let sp = [];
			if (spots[0]['program'] == prog) {
				let qsos = spots[0]['qsos'];

				for (const p of spots) {
					sp.push(
						{
							x: new Date(p['spotTime']),
							y: rc,
							z: p['activator'] + " " + p['reference'] + " " + p['frequency'] + " " + p['mode'] + " " + p['comment'],
							ref: ref,
							code: p['reference']
						})
				}

				if (prefs['by_call'] || prog == 'SOTA' ||
					!prefs['show_potalog'] || qsos != null) {
					d = {
						label: ref,
						pointRadius: 5,
						data: sp
					};
				}
				else {
					d = {
						label: ref,
						pointRadius: 8,
						pointBoderWidth: 4,
						data: sp
					};
				}
				datasets.push(d)
				rc += 1;
			}
		}
	}
	let ctx = document.getElementById('myChart').getContext('2d');
	let cnt = document.getElementById('chart-container');

	ctx.canvas.height = rc * 20 + (rc / 3 + 1) * 30;
	cnt.style.height = ctx.canvas.height + 40;

	if (chart) {
		chart.destroy();
	}
	let now = new Date();
	let spot_from = new Date(now.getTime() - prefs['spot_period'] * 1000 * 3600);
	let spot_to = new Date(now.getTime() + 300 * 1000);

	chart = new Chart(ctx, {
		type: 'line',

		data: {
			datasets: datasets
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			layout: {
				padding: {
					left: 20,
					right: 20,
				}
			},
			plugins: {
				legend: {
					position: 'top',
					reverse: true,
				},
				tooltip: {
					backgroundColor: "rgba(19, 58, 95, 09)",
					xPading: 10,
					yPadding: 10,
					callbacks: {
						label: label_callback,
					},
				},
				customCanvasBackgroundColor: {
					color: 'white',
				}
			},
			scales: {
				x: {
					type: 'time',
					time: {
						unit: 'hour',
						displayFormats: {
							'hour': 'MM/dd HH:mm',
						},
					},
					max: spot_to,
					min: spot_from,
				},
				y: {
					display: false,
				},
			}
		},
		plugins: [plugin],
	});
	chart.update();
}
