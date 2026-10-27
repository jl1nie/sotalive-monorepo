# 新版が、旧版と違う出力を出す点(意図した差分)

新版(`apps/myact-next`)の golden master の比較で、ここに書いてある差分だけを許す。理由と、決めた人・日を書く。

| 項目 | 旧版の出力 | 新版 | 理由 |
|---|---|---|---|
| ActPaddle の `$CALL`・`$SOTA` などの置き換え | 最初の 1 つだけ(`String.replace`) | すべて | 利用者の決定(2026-10-27) |
| ActPaddle の WiFi の `Content-Type` | `applicatoin/json`(誤字) | `application/json` | 誤字の修正 |
| ActPaddle の接続エラー | `alert('接続エラー: …')` | ダイアログの中に表示(`role=alert`)。文言は旧版の先頭と同じ | alert は、画面を止めるため。送信の成功も、同じ場所に出す |
| ActPaddle のダイアログ | Bootstrap のモーダル | `<dialog>`(POTA ログと同じ) | 旧版の jQuery・Bootstrap の JS に頼らない |
| APRS 軌跡のマーカーのポップアップ | 追加のたびに開く(全部開いて、最後の 1 つだけが残る) | 押したときだけ開く | 開いたままの 1 つは、地図を覆うだけで、意図がない |
| ポップアップの位置リンク(`maps.gsi.go.jp`・Google マップ)の `rel` | なし(`target="_blank"` のみ) | `rel="noopener"` | 外部リンクの安全性(参照の見出しのリンクは、旧版も `noopener`) |
| Windy・マップコードのリンクの `rel` | なし | `rel="noopener"` | 同上 |
| 旧版の GPS の高度の併記 | コードにあるが無効(`if (false && …)`) | 出さない | 旧版の実際の動作と同じ |

(段階 1 以降、差分が出たら、この表に足す。)
