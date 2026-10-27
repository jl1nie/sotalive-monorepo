# @sotalive/myact-next — 次期 MyACT

Vite + 素の TypeScript + 旧版の Bootstrap 4.5 の CSS。設計は `docs/myact-next-design.md`、画面案は `docs/mocks/myact/`。
旧版を正解にした記録(`packages/myact-golden`)と同じ出力を出すことを、基準にする。公開は `myact2.sotalive.net`(試験中・`noindex`)。本番(`myact.sotalive.net`)は、まだ旧版。

## いま動くもの(段階 1 の途中)
- 地図(地理院タイル)・現在地(QTH。許可の保留・拒否は、地図の上の帯に出す)・URL の位置(`?lat=&lon=&z=`)
- **地図の空白をクリックしたポップアップ**: JCC/JCG・住所・GL・位置・標高・天気、半径 200m 以内の山(見出し・標高・ポイント・Activations)。旧版の記録と、同じ行・同じ文言
- **POTA ログ**(必須): ナビバーから開く。確認・アップロード・削除・共有キーの EXPORT/IMPORT・Activator/Hunter の切り替え。ログはサーバーに UUID で保存され、UUID は旧版と同じ Cookie(`pota_activator_uuid`・`pota_hunter_uuid`)に持つ。`log_id` は、ポップアップの取得に付く

## まだないもの
マーカー(山・公園)・検索・公園区域・アクティベーションゾーン・APRS・スポット・チャート・設定画面・ActPaddle・POTA ログの統計(ボタンだけ)。順に作る(設計の 9 章)。

## 構成
- `src/api.ts` — sotaapp2 の API クライアント(旧版 `fetchAPI` と同じ決まり。失敗は null)
- `src/prefs.ts`・`src/cookie.ts` — 設定。旧版と同じ Cookie の名前・値の形(切り替えても引き継がれる)
- `src/potalog.ts` — POTA ログのダイアログ(`<dialog>`)。`src/dom.ts` は DOM を組み立てる小さな関数(外から来る値は textContent で入れる)
- `src/popup.ts` — ポップアップ(B1・B2・B4・B5)
- `src/main.ts` — 地図・現在地・配線。`src/locate-status.ts`・`src/zoom-label.ts`・`src/marker.ts` は、myqth の新版と同じもの(段階 1 で、共有の package に出す)

## テスト
```bash
pnpm --filter @sotalive/myact-next test                                   # 単体(vitest。jsdom)
pnpm --filter @sotalive/myact-next build && pnpm --filter @sotalive/myact-next test:e2e   # ビルドして、ブラウザーで開く(Playwright)
```
e2e は、`packages/myact-golden` の固定の応答(`world.mjs`・`fixtures/`)を使い、**旧版の記録(`expected/blank-*.json`・`gps-tokyo.json`)と、ポップアップの行を直接比べる**。
