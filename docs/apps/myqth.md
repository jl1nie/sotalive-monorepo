# MyQTH

MyQTH は、いまいる場所(QTH)を地図に出し、その場所のコード類を調べる小さなアプリです。
運用地の JCC・JCG(日本のアワードで使う市区町村の番号)とグリッドロケータをその場で知るために使います。

- 公開先: https://myqth.sotalive.net (本番。旧版)
- このリポジトリでは `apps/myqth-org` です。React 版はありません。

## 機能

`apps/myqth-org/index.html` を読んで確かめた内容です。

- 起動すると、ブラウザの位置情報を取り、現在地に QTH マーカー(ドラッグできます)を置きます。
- 画面上部の QTH ボタンで、位置を取り直せます。
- 地図を押すと、その場所の情報をポップアップで見せます。
  - 日本国内: JCC 番号(区のある市は区番号も)、都道府県と市区町村、グリッドロケータ。JCC のない地域は JCG と HAMLOG のコード。
  - 日本の外: 緯度経度とグリッドロケータだけ。
- マーカーをドラッグすると、移した先の情報を出します。
- 位置情報が取れないときは、前回の位置(Cookie に保存)か、日本の中心付近を表示します。
- 地図は地理院タイルです。スケールとズームの表示、時計もあります(Thunderforest のレイヤーも定義してありますが、切り替えの操作は見当たりません)。
- 住所などの引き当ては、ブラウザの中で行います(`revgeocoder.js`)。
  国土地理院の逆ジオコーダーと標高の API、バックエンドの `https://sotaapp2.sotalive.net/api/v2/locator/jcc-jcg` を使います。

## 技術的な特徴

- jQuery + Bootstrap 4 + MDBootstrap + Leaflet 1.2 の、ビルドのない静的なサイトです。ライブラリは CDN から読みます。
- `apps/myqth-org/` にあるのは `index.html` と `site-qth.webmanifest.json`(ホーム画面に追加するときの設定)だけです。
  CSS・JS・画像・フォントは、共通アセットを使います。
- バックエンドは直接(`sotaapp2.sotalive.net`)呼びます。Functions はありません。

## 共通アセットの仕組み

`packages/shared/common` は、MyActivation の旧版と MyQTH が共有するファイルの置き場所です。
旧 Vercel 版(`sotalive-vercel`)の `public/common` と同じ内容です。旧 Vercel 版ではシンボリックリンクで共有していました。

```
packages/shared/
  404.html          ないパス用のページ
  common/
    css/  js/  img/  font/  svg/  json/  favicon/
```

Cloudflare Pages は、シンボリックリンクを扱えません。
そこで `scripts/build-static-projects.sh` が、アプリごとに必要なディレクトリを、出力の先頭へコピーします。

| 出力 | コピーする共通アセット |
|---|---|
| `dist-myact/` | `css js img font svg json` |
| `dist-myqth/` | `css js img font svg` |

さらに、次のものを同じ先頭へ置きます。

- `favicon/` の中身(ルートに置きます)
- `apps/myqth-org/index.html` と webmanifest
- `packages/shared/404.html`(これがないと Pages は、どのパスにも `index.html` を返します)

そのため `index.html` の `css/…`、`js/…` は、相対パスのまま動きます。

共通アセットの JS には、地図のプラグイン(`leaflet.extra-markers`、`L.Icon.Pulse`、`L.Control.ZoomLabel` など)、逆ジオコーダー(`revgeocoder.js`)、標高とアクティベーションゾーンの計算(`getDEM.js`、`actzone.js`)などがあります。

React 版の myact も、`/json/` などの共通アセットを使うため、`scripts/assemble.sh` が `dist/shared/` に置きます([myact.md](myact.md))。

## ビルドと配置先

| 項目 | 内容 |
|---|---|
| Pages プロジェクト | `sotalive-myqth` (Functions なし) |
| ホスト名 | `myqth.sotalive.net` |
| ビルド | なし。`scripts/build-static-projects.sh` が `dist-myqth/` を作る |
| デプロイ | CI の `deploy-legacy`(matrix: myact、myqth)。[docs/ci-cd.md](../ci-cd.md) を参照 |

## 開発とテストのコマンド

テストはありません。

```bash
# dist-myqth を組み立てて、ローカルで配る
scripts/build-static-projects.sh
npx serve dist-myqth
```

`index.html` を直したときは、この手順で `dist-myqth/` を作り直して確かめてください。
共通アセットを直したときは、MyActivation の旧版にも効くので、両方を確かめます。

旧版を持ってくる元(`sotalive-vercel`)が古いまま移すと、本番を壊すことがあります。
本番の配信物と比べてから変更してください。

全体の開発手順は [docs/development.md](../development.md) を参照してください。

## 新版(`apps/myqth`。移行中)

旧版を、Vite + 素の TypeScript に移したものです。React は使いません(軽さが売りで、画面もポップアップと現在地だけなので)。見た目は旧版のままにするため、Bootstrap 4.5.0 の CSS を使い、旧版が MDB・Semantic UI から受けていた文字の大きさ・書体・ボタンの見た目だけを `src/style.css` に写しています。jQuery・Popper・Bootstrap/MDB の JS・Semantic UI・Font Awesome・`leaflet.extra-markers`(PNG のスプライト)は読みません。

- 逆ジオコーダーは `packages/geo`(`@sotalive/geo`)。**国土地理院(住所・標高)は、利用者のブラウザーから直接呼ぶ**。アクセス元を利用者ごとに分散するためで、バックエンド(sotaapp2)にまとめない。バックエンドを通るのは、自治体コード → JCC/JCG の表検索だけ
- 結果は ok / outside(日本の外)/ error(通信・サーバーの異常)。旧版は、標高の失敗も「圏外」と出していた。error はキャッシュしない
- 旧版の Yahoo の逆ジオコーダーへの経路(国土地理院のメンテナンス中の予備)は、呼び先が今はないので、移していない
- 旧版との違い: 取得に失敗したときの文言(`住所を取得できませんでした`)、`JCG` の項目が空のとき `null` と出さない、現在地を最初から日本全体の位置で開く(位置情報を待つあいだも地図が出る)。Cookie(`my_qth_lat`・`my_qth_lng`)は、名前も、ブラウザーを閉じるまでの寿命も、旧版のまま

### 配置

`scripts/assemble.sh` が `apps/myqth/dist` を `dist/myqth2/` に置き、プロジェクト sotalive の `functions/_middleware.ts` が、ホスト名 `myqth2` を `/myqth2` に振り分けます(`noindex`)。DNS は、`myqth2` の CNAME を `sotalive.pages.dev` へ。Pages のプロジェクト sotalive に、カスタムドメイン `myqth2.sotalive.net` も足す([デプロイの手順](../deploy-guide.md)。CNAME だけでは 522 や 404 になる)。プレビューのデプロイ(`feat-….sotalive.pages.dev`)はホスト名で振り分けられないので、確かめるのは、手元の `wrangler pages dev dist`(`Host: myqth2.sotalive.net` を付ける)か、main へのマージのあと。`myqth.sotalive.net`(旧版)は、新版の確認が済むまでそのままです。

### テスト

```bash
pnpm --filter @sotalive/geo test                       # 逆ジオコーダー(fetch を差し替え)
pnpm --filter @sotalive/myqth test                     # ポップアップの文言
pnpm --filter @sotalive/myqth build && node --test apps/myqth/e2e/myqth.e2e.mjs   # ビルドして、ブラウザーで開く
```

e2e は、旧版と同じ固定の応答で、地図のクリックのポップアップ(旧版と同じ文言)・hsrc なし・国土地理院が 500・現在地(Cookie に覚える)・位置情報の拒否(前回の位置)・位置情報のないブラウザーを確かめます。

### 軽さの実測(2026-10-27。初回の読み込み。地図のタイルは除く。キャッシュなし。ローカルの配信分は gzip 換算)

| | リクエスト | 転送量 | DOMContentLoaded |
|---|---|---|---|
| 旧版(`apps/myqth-org`) | 34 | 約 610KB | 約 200ms |
| 新版(`apps/myqth`) | 9 | 約 107KB(JS 47KB・CSS 31KB・フォント(Lato)) | 約 100ms |

見た目は、同じ大きさ(PC 1280×800・スマートフォン 390×844)のスクリーンショットと、`getComputedStyle` の値(文字の大きさ・ナビバーの高さ・ポップアップ)で、旧版と比べました。残る差は、Leaflet のバージョン(1.2 → 1.9)の細かい描画と、現在地のマーカー(PNG → SVG)です。

