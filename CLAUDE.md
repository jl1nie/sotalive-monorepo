# CLAUDE.md

Claude Code用プロジェクト指示ファイル

## プロジェクト概要

sotalive-monorepoは、SOTA/POTAアマチュア無線アワード支援サービスのフロントエンドモノレポです。バックエンドAPI（sotaapp2）と連携して動作します。

## 技術スタック

- **パッケージマネージャ**: pnpm
- **ビルドシステム**: Turborepo
- **タスクランナー**: cargo-make (makers)
- **ホスティング**: Cloudflare Pages + Workers
- **バックエンドAPI**: sotaapp2 (Rust/Axum on Fly.io)

### 現行アプリ（レガシー）
- jQuery + Bootstrap 4 + Leaflet
- インラインJS/CSSから外部ファイルに分離済み

### 移行先（計画中）
- React 18 + TypeScript
- Vite
- react-leaflet
- Zustand（状態管理）
- Vitest + Testing Library

## ディレクトリ構造

```
sotalive-monorepo/
├── apps/
│   ├── myact/          # MyActivation の React 版（移行中。myact2.sotalive.net で試す）→ dist/myact2
│   ├── myact-org/      # MyActivation の旧版（jQuery。外部CSS・JSに分離済み）→ dist/myact
│   ├── myqth-org/      # MyQTH の旧版（index.html だけ。css・js などは共通アセット）→ dist/myqth
│   ├── logconv/        # LogConverter（ログ形式変換。WSPR はタブとして統合）
│   └── fle/            # FLE Online
├── packages/
│   └── shared/         # 共通アセット（旧版の myact・myqth が共有。Vercel 版の public/common と同じ）
├── functions/
│   └── _middleware.ts  # Cloudflare Workers（API proxy + routing）
├── dist/               # ビルド出力
├── wrangler.toml       # Cloudflare設定
└── turbo.json          # Turborepo設定
```

## 開発コマンド

```bash
# 依存関係インストール
pnpm install

# 開発サーバー起動
pnpm run dev
# または
makers dev

# ビルド
pnpm run build

# デプロイ
pnpm run pages:deploy        # Production (main)
pnpm run pages:deploy:preview # Preview (develop)
```

## API構成

全APIリクエスト（`/api/*`）は `functions/_middleware.ts` で sotaapp2.fly.dev にプロキシされます。

主要エンドポイント:
- `/api/v2/search` - リファレンス検索
- `/api/v2/activation/*` - アクティベーション・スポット
- `/api/v2/sota/*` - SOTAログ管理
- `/api/v2/pota/*` - POTAログ管理
- `/api/v2/wspr/svg` - WSPR SVG生成
- `/api/v2/logconv/*` - ログ変換
- `/api/v2/fle/*` - FLE形式パース

## サブドメイン構成

公開しているアプリは、それぞれ別の Pages プロジェクト（静的なファイルは Functions の無料枠 1日10万リクエストを使わない）。`scripts/build-static-projects.sh` が、ルートに置いた `dist-myact`・`dist-myqth`・`dist-fle` を作る。
まだ公開していない logconv2・myact2 だけが、プロジェクト sotalive のホスト名での振り分け（`functions/_middleware.ts`。アプリ自身のファイルがなければ共通アセット）を使う。

| サブドメイン | アプリ | プロジェクト（CNAME 先） | 備考 |
|------------|--------|------|------|
| myact.sotalive.net / mypilgrim / www | MyActivation（旧版。apps/myact-org） | sotalive-myact | www の `/logconv` 以下は logconv.sotalive.net へ転送（`_redirects`） |
| myqth.sotalive.net | MyQTH（旧版。apps/myqth-org） | sotalive-myqth | |
| logconv.sotalive.net / logconv2 | LogConverter | sotalive | logconv は、新しい logconv のテストが済むまで Vercel の旧画面のまま。移すときは www の転送も外す |
| fleonline.sotalive.net | FLE Online | sotalive-fle | `/fle/`（`/` は転送）。Functions は `/api` の下だけ（`pages/fle`：設定の同期の KV と、バックエンドへの中継） |
| myact2.sotalive.net | MyActivation（React 版。試験中） | sotalive | `noindex`。React 版は base が `/` なので、このホスト名でだけ動く |

## Git運用

- `main` ブランチ → Production deploy
- `develop` ブランチ → Preview deploy
- PRマージで自動デプロイ（GitHub Actions）
- CI（`.github/workflows/ci.yml`）: PR と push で走る。変わったパスに関係するテストだけを並列に走らせ（Rust・fle・logconv・myact）、ビルドは1回（artifact でプロジェクトごとの出力を渡す）。デプロイは push のときだけで、Pages のプロジェクトごとに並列、関係するテストが通ってから。共通の部分（ワークフロー・lock ファイル・`packages/shared`・`scripts`）が変わったら、すべて走る。手元では `pnpm run test` / `pnpm run lint:apps`
- ビルド: `pnpm run build`（`build:apps` → `scripts/assemble.sh`）。FLE の wasm は CI でキャッシュする（`.github/actions/fle-wasm`。`crates/` が変わったときだけビルド）

## 関連リポジトリ

- **sotaapp2**: バックエンドAPI (Rust/Axum) - `/home/minoru/src/sotaapp2`
- **sotalive-vercel**: 旧フロントエンド（Vercel） - 移行後停止予定

## コード規約

### JavaScript/TypeScript
- 外部ライブラリはCDNではなくnpm installで管理（移行後）
- グローバル変数は避け、ES Modulesを使用（移行後）
- TypeScript strict mode

### CSS
- 外部CSSファイルに分離済み
- 移行後: CSS Modules または Tailwind CSS

## 今後の計画

1. **myact React移行**
   - Phase 1: Vite + React + TS環境構築
   - Phase 2: 型定義作成
   - Phase 3: 地図コンポーネント移行
   - Phase 4: モーダル・設定画面移行
   - Phase 5: テスト追加・旧コード削除

2. **logconv React移行**（myact完了後）

3. **Vercel停止**（Phase 4完了後、約3ヶ月）
