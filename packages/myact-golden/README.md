# @sotalive/myact-golden — 旧版 MyACT を正解にした記録(golden master)

次期 MyACT(`apps/myact-next`。設計は `docs/myact-next-design.md`)が、**旧版と同じ入力で、同じ出力を出す**ことの基準。
React 版が止まった原因は、UI の質の基準(見た目・ポップアップの仕様)がなかったこと。この記録が、「正しい中身」の基準になる。

旧版(`apps/myact-org/index.html` + `packages/shared/common/js/myact.js`)を、Playwright の Chromium で、**固定の応答**(`fixtures/`)で動かし、シナリオごとに出力を `expected/*.json` に記録してある。

```bash
pnpm --filter @sotalive/myact-golden verify            # 旧版を走らせ直して、expected と比べる(CI と同じ)
pnpm --filter @sotalive/myact-golden verify blank      # 名前に blank を含むものだけ
pnpm --filter @sotalive/myact-golden record            # 旧版の出力で、expected を書き直す(旧版を意図して変えたとき)
pnpm --filter @sotalive/myact-golden record-fixtures   # 本物の sotaapp2・国土地理院の応答を、読み取りで取り直す(めったにしない)
```

## 何を記録するか(シナリオごと)
- ポップアップ: 行ごとのテキスト・空白を詰めた HTML・リンク(文字・`href`・`target`・`rel`)・ボタン
- マーカー: 種類(山の円・公園の四角)・色・大きさ・常時表示の文字
- sotaapp2 への要求(メソッド・パス・クエリ。`log_id` の有無など)・alert の文言・ページの例外・保存された Cookie

## シナリオ(`src/scenarios.mjs`)
- 地図の空白: 東京(圏内)・山の近く(200m 以内)・富士山頂(国土地理院に住所がなく、圏外になる山)・海上(圏外)・Google マップとマップコードの設定
- マーカー: 山(大山)・公園(丹沢大山国定公園)・POTA ログがあるとき(マーカーが赤、`log_id` が付く)・`pota_ref`・`jaff_ref` をオフ・Google マップ・マップコード・パドルのボタン・公園名の常時表示をオフ
- 公園区域: 左クリック・右クリック(デバッグ表示)
- 現在地(GPS)

(段階 0 の続きで、POTA ログの操作と ActPaddle のメッセージを足す。)

## 固定の応答(`fixtures/`)
`tools/record-fixtures.mjs` が、本物の応答を 1 回だけ記録した(GET のみ)。旧版・新版とも、これだけを読む。本物が変わっても、取り直さない限り、結果は変わらない。
公園区域の TopoJSON は、1 区域だけの小さなもの(`park-areas-small.json`。本物は 14MB)。

## 新版との比べ方(段階 1 以降)
新版の画面も、同じ `harness` と `scenarios` で動かし、`expected/` と比べる。**意図して変える点**は、`intentional-diffs.md` に理由と一緒に書く(書かれていない差分は、落とす)。
