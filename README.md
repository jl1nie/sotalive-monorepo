# sotalive-monorepo

SOTA/POTA アマチュア無線アワード支援サービス「sotalive」のフロントエンドをまとめたモノレポ(複数のアプリを1つのリポジトリで管理する形)です。
バックエンド API は別リポジトリの [sotaapp2](https://github.com/jl1nie/sotaapp2)(Rust / Axum、Fly.io)です。

ホスティングは Cloudflare Pages、デプロイは GitHub Actions です。
「GitHub Actions + Cloudflare Pages + Fly.io」の構成を、自分のアカウントで作り直せるように docs/ にまとめています。

## サービス一覧

| URL | 中身 | Pages プロジェクト | 状態 |
|---|---|---|---|
| myact.sotalive.net / www.sotalive.net | MyActivation 旧版(jQuery。`apps/myact-org`) | sotalive-myact | 本番 |
| myqth.sotalive.net | MyQTH(新版。Vite + 素の TS。`apps/myqth`。旧版 `apps/myqth-org` は戻せるように残す) | sotalive-myqth | 本番 |
| fleonline.sotalive.net | FLE Online(React。`apps/fle`) | sotalive-fle | 本番 |
| logconv.sotalive.net | LogConverter 新版(React。`apps/logconv`) | sotalive-logconv | 切り替え待ち([手順](docs/deploy-guide.md)) |
| myact2.sotalive.net | MyActivation 次期版(Vite + 素の TS。`apps/myact-next`) | sotalive | **試験中**(本番は旧版。POTA ログ・山と公園のマーカー・ポップアップまで) |
| myqth2.sotalive.net | MyQTH 新版を、本番より先に試す場所(`apps/myqth`) | sotalive | 試験用(`noindex`) |

MyActivation の React 版は開発中です。本番で使われているのは旧版(`apps/myact-org`)です。

## 全体の構成

```mermaid
flowchart LR
  B[ブラウザ]
  subgraph CF[Cloudflare Pages]
    P1[sotalive-myact<br>Functions なし]
    P2[sotalive-myqth<br>Functions なし]
    P3[sotalive-fle<br>Functions は /api のみ]
    P4[sotalive<br>Functions: ホスト名で振り分け]
  end
  subgraph FLY[Fly.io]
    API[sotaapp2<br>Rust / Axum + SQLite]
  end
  EXT[外部サービス<br>SOTA / POTA / APRS-IS / Firebase など]
  GH[GitHub Actions]

  B --> P1 & P2 & P3 & P4
  B -- 旧版は直接 --> API
  P3 -- /api/v2 を中継 --> API
  P4 -- /api を中継 --> API
  API --> EXT
  GH -- wrangler pages deploy --> CF
```

- 静的ファイルは Cloudflare Pages が配信します。
- `/api/*` は Functions がバックエンドへ中継します(中継先は Pages の環境変数 `BACKEND_URL`。なければ `sotaapp2.sotalive.net`)。旧版の MyActivation・MyQTH は `sotaapp2.sotalive.net` を直接呼びます。
- プロジェクトを4つに分けた理由は [docs/architecture.md](docs/architecture.md) にあります。

## ディレクトリの構成

```
apps/
  myact-next/   MyActivation の次期版(Vite + 素の TS)    -> dist/myact2
  myact/        MyActivation の React 版(凍結)           -> 出さない
  myqth/        MyQTH(Vite + 素の TS)                    -> dist-myqth・dist/myqth2
  myact-org/    MyActivation の旧版(jQuery)             -> dist-myact
  myqth-org/    MyQTH の旧版(戻せるように残す。出力なし)
  logconv/      LogConverter 新版(React。WSPR はタブ)    -> dist-logconv
  logconv-org/  LogConverter 旧版の静的ファイル
  fle/          FLE Online(React + Rust 製 wasm)         -> dist-fle/fle
crates/
  fle-core/     FLE 形式の解析・出力(Rust)
  fle-wasm/     fle-core を wasm にする
packages/shared/ 旧版が共有する共通アセット(css, js, img など)
functions/      Cloudflare Pages Functions(プロジェクト sotalive 用)
pages/fle/      FLE プロジェクト用の設定と Functions
scripts/        assemble.sh, build-static-projects.sh
tools/jaffpota/ 公園区域 TopoJSON の生成・版管理・検証(Python。uv)
.github/        CI/CD(workflows/ci.yml)と composite action
docs/           ドキュメント
dist, dist-*    ビルドの出力(git 管理外)
```

## 手元で動かす最短の手順

必要なもの: Node 20、pnpm 10、(FLE を動かすなら)Rust と wasm-pack。

```bash
pnpm install
pnpm --filter @sotalive/logconv dev   # http://localhost:3002/
pnpm --filter @sotalive/fle dev       # http://localhost:3003/fle/ (wasm も作る)
pnpm --filter @sotalive/myact dev     # Vite の既定のポート
```

テストは `pnpm run test`、lint は `pnpm run lint:apps`、全体のビルドは `pnpm run build` です。
詳しくは [docs/development.md](docs/development.md) を見てください。

## ドキュメント

| 文書 | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 全体の構成、ホスト名とプロジェクトの対応、リクエストの流れ |
| [docs/development.md](docs/development.md) | 手元での開発、テスト、ビルド |
| [docs/deploy-guide.md](docs/deploy-guide.md) | 自分のアカウントで同じ環境を作る手順 |
| [docs/ci-cd.md](docs/ci-cd.md) | GitHub Actions のワークフロー |
| [docs/backend.md](docs/backend.md) | バックエンド(sotaapp2)と Fly.io |
| [docs/apps/fle.md](docs/apps/fle.md) | FLE Online |
| [docs/apps/logconv.md](docs/apps/logconv.md) | LogConverter |
| [docs/apps/myact.md](docs/apps/myact.md) | MyActivation |
| [docs/apps/myqth.md](docs/apps/myqth.md) | MyQTH |
| [docs/park-areas.md](docs/park-areas.md) | 公園区域データ(jaffpota-annotated-vN.json)の再生成・版の更新・DB とのずれの直し方 |
| [docs/fle-grammar.md](docs/fle-grammar.md) | FLE 形式の文法 |
| [docs/fle-protocol.md](docs/fle-protocol.md) | FLE のコアと画面のあいだの取り決め |

## 関連リポジトリ

- [sotaapp2](https://github.com/jl1nie/sotaapp2): バックエンド API(Rust / Axum)
- sotalive-vercel: 旧フロントエンド(Vercel)。移行が終わったら停止する予定です。

## ライセンス

Apache License 2.0 です。[LICENSE](LICENSE) を見てください。

Copyright 2025-2026 Minoru Tomobe (JL1NIE)
