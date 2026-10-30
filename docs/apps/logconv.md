# LogConverter (logconv)

LogConverter は、ログソフトが出したファイルを、SOTA・POTA などの提出用の形式に変換するアプリです。
WSPRnet のスポットから、SNR(受信の強さ)の分布図を作る機能も、同じ画面のタブにあります。

## 公開の状態

| 版 | URL | 状態 |
|---|---|---|
| 新版(このリポジトリの `apps/logconv`。React) | https://logconv.sotalive.net | 専用の Pages プロジェクト `sotalive-logconv`。logconv2 は外した |
| 旧版 | Vercel の旧画面 | 切り替え後に止める([deploy-guide.md](../deploy-guide.md)) |

`www.sotalive.net` の `/logconv` 以下は、`logconv.sotalive.net` へ 302 で転送します(`dist-myact/_redirects`)。

なお `apps/logconv-org` は旧画面のファイル一式で、いまのビルドには使いません。

## 機能

画面には 4 つのタブがあります(`apps/logconv/src/components/Tabs/TabContainer.tsx`)。

| タブ | 入力 | 出力 |
|---|---|---|
| SOTA/JAFF/POTA ADIF | HAMLOG の CSV | ADIF を入れた zip(`<コール>_adif.zip`)。生成の前に CSV をサーバーで確認し、エラーがあれば生成しません。確認後の内容は画面の表で見られます |
| SOTA Activator | HAMLOG の CSV | SOTA のアクティベータログ(`<コール>_sota_activator.zip`) |
| SOTA Chaser | HAMLOG の CSV | SOTA のチェイサーログ(`<コール>_sota_chaser.zip`) |
| WSPRnet SNR | WSPRnet のスポット検索結果(貼り付けか CSV・テキストのファイル) | SNR 分布の SVG 図 |

入力できるファイルは、タブにより `.csv`、`.txt` です。
ほかのログソフトの形式を使う場合は、まず HAMLOG の CSV に直す必要があります(このアプリの入力は HAMLOG の CSV です。コードで確認した範囲)。

自局の山・公園や相手局の場所は、フォームで入力するか、HAMLOG の Remarks1、Remarks2、QTH 欄から読むかを選びます。
設定は端末に保存します(Zustand の `persist`。`stores/prefsStore.ts`)。表示テーマ(明るい・暗い・端末に合わせる)も選べます。

### WSPR のタブ

WSPR は、微弱な電波で届く範囲を調べる通信方式です。このタブは次の手順で使います。

1. WSPRnet のスポット検索の結果をコピーして貼り付け、Analyze を押します。13 項目の行だけを読み、余計な行は無視します(`src/lib/wspr.ts`)。
2. 最大 4 系列(Red・Blue・Green・Cyan)に、名前と開始・終了の時刻(UTC)を指定します。
3. 距離の下限・上限(km)、局名を出すか(Annotation)を指定して、グラフを作ります。SVG が画面に出ます。

旧 WSPR 画面は、このタブに統合されています。使い方の解説記事へのリンクが画面にあります。

## 技術的な特徴

- React 19、TypeScript、Vite 7、Tailwind CSS 4。
- 状態管理は Zustand、通信の状態管理は TanStack Query(依存に入っています)。
- 変換そのものは、サーバー(バックエンド sotaapp2)がします。このアプリは、ファイルとオプションを送り、結果を受け取ってダウンロードさせます。
- 構成は、タブごとのコンポーネント(`components/Tabs/`)と、フォーム部品(`components/Forms/`)です。

### 使うバックエンド API

画面は、すべて同じオリジンの `/api/v2/...` を呼びます。本番では Cloudflare の Functions がバックエンドに中継します(中継先は環境変数 `BACKEND_URL`。なければ `sotaapp2.sotalive.net`)。

| API | 使うタブ | 送るもの |
|---|---|---|
| `POST /api/v2/logconv/hamlog` | ADIF、SOTA Activator、SOTA Chaser | multipart。`file`(CSV)と `options`(JSON)。`options.format` は `pota`、`sota_a`、`sota_c` |
| `POST /api/v2/logconv/pota` | ADIF(CSV の確認) | 同上。`options.command` に `ADIFCSVCheck` |
| `POST /api/v2/wspr/svg` | WSPRnet SNR | `application/x-www-form-urlencoded`。`arg` に JSON(題名、系列、km の範囲、Annotation、幅、スポット) |

バックエンドの詳細は [docs/backend.md](../backend.md) を参照してください。

## ディレクトリとおもなファイル

```
apps/logconv/
  index.html
  vite.config.ts          base は /、開発ポート 3002、/api をバックエンドへ中継(BACKEND_URL、なければ sotaapp2.sotalive.net)
  src/App.tsx
  src/components/Tabs/    4 つのタブ(と、そのテスト)
  src/components/Forms/   ファイル選択・ラジオなどの部品
  src/components/Layout/  Header、SettingsDialog
  src/stores/prefsStore.ts
  src/lib/wspr.ts         WSPRnet の結果の読み取り
  src/types/              API・フォームの型
  src/test/               テストの設定と入力例
```

## ビルドと配置先

| 項目 | 内容 |
|---|---|
| Pages プロジェクト | `sotalive-logconv` |
| ホスト名 | `logconv.sotalive.net` |
| 配置 | `scripts/build-static-projects.sh` が `apps/logconv/dist` を `dist-logconv/` へコピーする(ルートに置く) |
| Functions | `/api` の下だけ(`pages/logconv/functions/api/v2/[[path]].ts`)。バックエンドへ中継する。ほかのパスは静的なファイルで、Functions の無料枠を使わない |

理由は [docs/architecture.md](../architecture.md) を参照してください。

## 開発とテストのコマンド

```bash
# 開発サーバー(ポート 3002)
pnpm --filter @sotalive/logconv run dev

# 型検査・テスト・lint(CI と同じ)
cd apps/logconv
pnpm exec tsc -b
pnpm exec vitest run
pnpm exec eslint .

# リポジトリ全体のテスト
pnpm run test
```

全体の開発手順は [docs/development.md](../development.md) を参照してください。
