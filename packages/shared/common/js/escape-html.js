// 外から来た値(山・公園の名前、逆ジオコーダーの結果、スポットのコメントなど)を HTML に入れるときに使う。
// 文字列の連結と同じく null・undefined はそのまま文字にする(表示を変えない)
function escapeHTML(v) {
	return String(v).replace(/[&<>"']/g, function (c) {
		return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
	});
}
