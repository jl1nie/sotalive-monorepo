# バックエンド(sotaapp2)の概要

このリポジトリのアプリが呼ぶ API は、別リポジトリ [jl1nie/sotaapp2](https://github.com/jl1nie/sotaapp2)(Rust、Apache License 2.0)にあります。
この文書は、フロントエンド側から見た概要だけを書きます。詳しくは sotaapp2 の `README.md` と `docs/` を読んでください。

## 構成

- 言語とフレームワークは Rust と Axum です。
- ヘキサゴナル構成(中心にビジネスルールを置き、外との出入りを外側の層に分ける作り)です。
- DB は SQLite です。Fly.io のボリュームを `/data` に付け、`/data/sotaapp2.db` を使います。

| クレート(ディレクトリ) | 役割 |
|---|---|
| `api` | REST のハンドラー、認証、CORS |
| `service` | ユースケース、定期処理 |
| `domain` | エンティティ(山、公園、スポットなど) |
| `adapter` | DB、外部 API、APRS-IS との入出力。マイグレーションは `adapter/migrations/sqlite` |
| `registry` | 依存性の組み立て |
| `common` | 設定、エラー型、共通の道具 |

`admin/` は管理画面(Node でビルドして `static/` に入れる)、`vendor/fireauth` は取り込んだ Firebase 認証のクレートです。

## 外部サービスとの連携

| 相手 | 用途 |
|---|---|
| SOTA(`api2.sota.org.uk`、`sotadata.org.uk`) | アラート、山のリスト |
| POTA(`api.pota.app`、`pota.app`) | スポット、アラート、公園のリスト |
| APRS-IS | 無線の位置情報 |
| NOAA の地磁気データ | 地磁気指数 |
| mapcode(`japanmapcode.com`) | 座標と mapcode の変換 |
| Firebase 認証 | ログインの確認 |

環境変数の全部は `.env.example`(sotaapp2 側)を見てください。必須なのは `DATABASE_URL`、`FIREBASE_API_KEY`、`APRSUSER`、`APRSPASSWORD` の4つです。
主な任意の設定は `CORS_ORIGIN`、`RUN_MIGRATION`、`APRSHOST` などです。

## Fly.io の構成(`fly.toml`)

| 項目 | 値 |
|---|---|
| アプリ名 | `sotaapp2` |
| リージョン | `nrt`(東京) |
| イメージ | `jl1nie/sotaapp2:latest`(Docker Hub) |
| マシン | `shared-cpu-1x`、メモリ 256MB、swap 256MB |
| ボリューム | `data` を `/data` に |
| 公開ポート | 内部 8080、HTTPS を強制 |
| 常時起動 | `auto_stop_machines = 'off'`、`min_machines_running = 1` |
| ヘルスチェック | `GET /api/v2/health`(30 秒ごと) |

## このリポジトリのアプリが使う API

主なものだけです。

| パス | 使うアプリ |
|---|---|
| `/api/v2/search/brief` | MyActivation 旧版(リファレンス検索) |
| `/api/v2/locator/jcc-jcg` | MyActivation 旧版 |
| `/api/v2/revgeocode` | MyActivation React 版 |
| `/api/v2/sota/summits/search`、`/api/v2/pota/parks/search` | FLE Online(山と公園の検索) |
| `/api/v2/logconv/hamlog`、`/api/v2/logconv/pota` | LogConverter |
| `/api/v2/wspr/svg` | LogConverter(WSPR のタブ) |

呼び方は2通りあります。

- 旧版の MyActivation・MyQTH は、`sotaapp2.sotalive.net`(Fly.io の独自ドメイン)を直接呼びます。
- FLE Online は、自分の `/api/v2/*` を `pages/fle/functions/api/v2/[[path]].ts` が `sotaapp2.fly.dev` へ中継します。
- プロジェクト `sotalive` の `functions/_middleware.ts` も `/api/*` を中継します。

## CI とデプロイ(sotaapp2 側)

`.github/workflows/` に4つあります。

| ファイル | きっかけ | 内容 |
|---|---|---|
| `ci.yml` | PR と push(main・develop) | `cargo fmt`、`clippy`、`cargo nextest`、Docker イメージのビルドと E2E。main への push だけ Docker Hub(`jl1nie/sotaapp2`)へ push(`latest` と短い SHA のタグ) |
| `deploy.yml` | 手動(`workflow_dispatch`) | DB のバックアップ(`flyctl ssh sftp get`)、`flyctl deploy --image <SHA のタグ>`、ヘルスチェック、失敗したら前のイメージに戻す |
| `rollback.yml` | 手動 | 指定したタグのイメージに戻す |
| `release.yml` | `v*` のタグ | テストのあとにリリース |

Secrets は `DOCKERHUB_USERNAME`、`DOCKERHUB_TOKEN`、`FLY_API_TOKEN` です。
つまり、main に入っただけでは本番は変わりません。Actions の Deploy を手で実行して出します。

自分の環境で作る手順は [deploy-guide.md](deploy-guide.md)、フロントエンド側の CI は [ci-cd.md](ci-cd.md) を見てください。
