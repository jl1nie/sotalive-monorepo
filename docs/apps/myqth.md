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
