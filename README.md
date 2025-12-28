# sotalive-monorepo

SOTA/POTA アマチュア無線アワード支援サービスのフロントエンドモノレポ

## 構成

```
apps/
├── myact/      # MyActivation - SOTA/POTAアクティベーション管理
├── logconv/    # LogConverter - ログ形式変換ツール
└── wspr/       # WSPR - 電波伝搬解析
packages/
└── shared/     # 共通アセット (CSS, JS, images)
```

## 技術スタック

- **パッケージマネージャ**: pnpm
- **ビルドシステム**: Turborepo
- **タスクランナー**: cargo-make (makers)
- **ホスティング**: Cloudflare Pages
- **バックエンドAPI**: sotaapp2 (Rust/Axum on Fly.io)

## セットアップ

```bash
# 依存関係インストール
pnpm install
# または
makers install

# 開発サーバー起動
makers dev
```

## タスク一覧

```bash
makers --list          # 全タスク一覧
makers dev             # 開発サーバー起動
makers build           # 本番ビルド
makers deploy          # Cloudflare Pagesにデプロイ
makers deploy-preview  # プレビュー環境にデプロイ
makers clean           # ビルド成果物削除
makers check           # lint + typecheck
makers ci              # CI用 (check + build)
```

## サブドメイン構成

| サブドメイン | アプリ |
|------------|--------|
| myact2.sotalive.net | MyActivation |
| logconv2.sotalive.net | LogConverter |
| wspr2.sotalive.net | WSPR |

## バックエンドAPI

全てのAPIリクエスト (`/api/*`) は sotaapp2.fly.dev にプロキシされます。

- `/api/v2/wspr/*` - WSPR SVG生成
- `/api/v2/logconv/*` - ログ変換
- `/api/v2/fle/*` - FLE形式パース
