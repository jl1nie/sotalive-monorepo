# MyActivation (myact)

MyActivation (MyACT) は、SOTA・POTA のアワード活動を支える地図ベースの Web アプリです。
このリポジトリには 2 つの版があります。

| 版 | ディレクトリ | 状態 | URL |
|---|---|---|---|
| 旧版 | `apps/myact-org` | 本番 | myact.sotalive.net / www.sotalive.net |
| React 版 | `apps/myact` | **開発中** | myact2.sotalive.net (noindex) |

**React 版は開発中です。** 本番で使われているのは旧版です。React 版は、旧版と同じ機能を React で作り直しているところで、検索エンジンにも載せていません。

## 機能

機能の一覧は、`apps/myact/FEATURES.md` にまとまっています(旧版の機能を洗い出した文書です)。おもなものは次のとおりです。

| 分類 | 内容 |
|---|---|
| 地図 | 国土地理院のタイルの上に、SOTA のサミット(標高で色分け)と POTA/JAFF の公園を表示します。公園の領域は TopoJSON(`jaffpota-annotated-*.json`)から描きます(作り方と更新は [park-areas.md](../park-areas.md))。SOTA のアクティベーションゾーン(山頂から標高 25 m 以内)は、標高データから計算して塗ります |
| ポップアップ | 緯度経度、グリッドロケータ、JCC/JCG(市区町村コード)、標高、天気(Windy)へのリンク、サミットや公園の情報 |
| 検索 | サミット名・公園名・リファレンスコードで検索し、地図を移動します |
| スポット | SOTA/POTA のスポットを一覧とチャートで表示します |
| POTA ログ | POTA のサイトからダウンロードした CSV をアップロードすると、運用済みの公園を地図の色で区別できます。共有キーでログを渡せます |
| APRS | SOTA アクティベータの移動軌跡を地図に出します |
| 現在地 | GPS で現在地を取り、QTH マーカーを置きます(ドラッグできます) |
| パドルエミュレータ | CW のメッセージを、ESP32(WiFi)か Web Serial 経由で送ります |
| ヘッダー | 時計と地磁気の指数 |

バックエンド(`sotaapp2`)の `/api/v2/search`、`/activation/spots`、`/activation/aprs/track`、`/pota/log-stat`、`/propagation/geomag` などを使います(旧版の `index.html` と `FEATURES.md` で確認)。

## 旧版 (apps/myact-org)

jQuery + Bootstrap 4 + Leaflet で作った、ビルドのない静的なサイトです。

- 画面は `apps/myact-org/index.html` の 1 枚(インライン JS を含む)です。ライブラリ(jQuery、Bootstrap、MDBootstrap、Leaflet、Chart.js、topojson など)は CDN から読み込みます。
- 自前の JS・CSS・画像・フォント・JSON は、共通アセット `packages/shared/common` を使います。MyQTH と共有しています。仕組みは [myqth.md](myqth.md) を参照してください。
- API は `https://sotaapp2.sotalive.net/api/v2` を直接呼びます。このため Functions は要りません。
- `apps/myact-org/site-act.webmanifest.json` は、ホーム画面に追加したときの設定です。
- URL で地点を指定して開けます: `https://myact.sotalive.net/?lat=35.2018&lon=137.1724`(`&z=` でズーム。既定 15)。その地点をクリックしたときと同じポップアップ(クリック位置の JCC/JCG、近くのサミット、標高)が出ます。指定がない・範囲外のときは、これまでどおり現在地で開きます。
- 共通アセットのうち、myact には `css js img font svg json` を配ります(MyQTH は `json` なし)。

### ビルドと配置先(旧版)

| 項目 | 内容 |
|---|---|
| Pages プロジェクト | `sotalive-myact` (Functions なし) |
| ホスト名 | `myact.sotalive.net`、`www.sotalive.net` |
| ビルド | なし。`scripts/build-static-projects.sh` が `dist-myact/` に、共通アセット、ファビコン、`index.html`、webmanifest、`404.html` をコピーする |
| 転送 | 同じスクリプトが `dist-myact/_redirects` を作り、`/logconv` 以下を `logconv.sotalive.net` へ 302 転送する |

### 開発(旧版)

```bash
# apps/myact-org/package.json の dev は npx serve。ただし共通アセットは別の場所にあるので、
# 組み立てた dist-myact を配るほうが本番に近い
scripts/build-static-projects.sh
npx serve dist-myact
```

テストはありません。`apps/myact-org/package.json` の `dev` は、そのディレクトリを `npx serve -l 3001 .` で配ります。この方法では `css/` や `js/` が見つからないため、上の方法を勧めます(動作は未確認です)。

## React 版 (apps/myact) : 開発中

### 技術的な特徴

| 項目 | 内容 |
|---|---|
| UI | React 19、TypeScript、Vite 7 |
| 地図 | Leaflet 1.9 と react-leaflet 5 |
| 状態管理 | Zustand 5(`src/stores/`: mapStore、prefsStore、spotsStore) |
| 通信 | TanStack Query 5(`src/api/client.ts`) |
| グラフ | Recharts |
| 一覧 | react-window(仮想スクロール) |
| アイコン | Font Awesome |
| その他 | TopoJSON(`topojson-client`)、多言語対応(`src/i18n/`) |
| テスト | Vitest と Testing Library(jsdom) |

React 版の `base` は `/` です。そのため、ホスト名ごとにルートで配る `myact2.sotalive.net` でだけ動きます。
開発サーバーは、`/api` を `https://sotaapp2.sotalive.net` へ中継します。

### ディレクトリとおもなファイル

```
apps/myact/
  FEATURES.md               機能一覧と、移行時の検討事項
  vite.config.ts            base は /、/api の中継
  vitest.config.ts
  src/App.tsx               QueryClient とレイアウト
  src/components/
    Map/                    MapContainer、markers/、layers/(公園領域、アクティベーションゾーン、APRS、QTH)、popup/
    Search/  Spots/(Chart/ を含む)  PotaLog/  Keyer/  Settings/  common/Header.tsx
  src/stores/               Zustand のストア
  src/hooks/                useSpots、useAprsTrack、useGeolocation、useGeomag、useSearch、useTheme など
  src/api/                  client.ts、revgeocode.ts
  src/i18n/                 翻訳
  src/types/
```

どの機能が旧版と同等まで実装済みかは、確かめていません。

### ビルドと配置先(React 版)

| 項目 | 内容 |
|---|---|
| Pages プロジェクト | `sotalive` |
| ホスト名 | `myact2.sotalive.net` |
| 配置 | `scripts/assemble.sh` が `apps/myact/dist` を `dist/myact2/` へ、共通アセットを `dist/shared/` へコピーする |
| 振り分け | `functions/_middleware.ts` がホスト名 myact2 のとき `/myact2` の下を返す。アプリのファイルがなければ共通アセット(React 版も `/json/` などを使う)。応答に `x-robots-tag: noindex` を付ける |

### 開発とテストのコマンド

```bash
# 開発サーバー(Vite の既定のポート)
pnpm --filter @sotalive/myact run dev

# 型検査・テスト・lint(CI と同じ)
cd apps/myact
pnpm exec tsc -b
pnpm exec vitest run --passWithNoTests
pnpm exec eslint .
```

## 移行の計画

CLAUDE.md の「今後の計画」では、次の段階で進めます。

1. Vite + React + TypeScript の環境を作る
2. 型定義を作る
3. 地図コンポーネントを移す
4. モーダルと設定画面を移す
5. テストを足し、旧コードを消す

myact の移行が済んだあとに logconv の React 移行([logconv.md](logconv.md))、旧 Vercel 版の停止(約 3 か月後)と続きます。
React 版を試せるようになったら、本番の `myact.sotalive.net` を React 版に切り替えます(この切り替えの手順は、まだ決まっていません)。

全体の開発手順は [docs/development.md](../development.md)、構成は [docs/architecture.md](../architecture.md) を参照してください。
