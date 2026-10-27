# CI/CD

このリポジトリの GitHub Actions は `.github/workflows/ci.yml` の1本だけです。
テスト、ビルド、Cloudflare Pages へのデプロイを行います。
バックエンド(sotaapp2)の CI は別リポジトリです。[backend.md](backend.md) を見てください。

## きっかけ

- push: `main`(本番)、`develop`、`feat/**`(どちらもプレビュー)
- PR: `main` と `develop` あて

同じブランチでは1本ずつ走ります(`concurrency`)。PR は新しい push で古い実行を止めます。
push は止めません。続けてマージしたとき、古い内容が後から上書きしないようにするためです。

## ジョブの構成と依存

```
                    changes  (変わったパスを判定)
                       |
     +---------+-------+--------+---------+---------+
     |         |       |        |         |         |
   rust       fle   logconv   myact     build     parks  (build は1回だけ。artifact を作る)
     |         |       |        |         |
     |         |       +---+----+---------+--> deploy-sotalive  (logconv, myact, build)
     |         |           |
     +----+----+-----------+--------------> deploy-fle   (rust, fle, build)
          |
          +------------------------------> deploy-legacy (build, parks。myact・myqth を matrix で)
```

- テストの5つ(`rust`、`fle`、`logconv`、`myact`、`parks`)と `build` は並列です。
- デプロイは push のときだけです。Pages のプロジェクトごとに並列で、関係するテストだけを待ちます。
- 待つジョブに失敗か中止があれば出しません。変更がなくて飛ばしたジョブは待たずに進みます。

| ジョブ | 内容 |
|---|---|
| `changes` | `dorny/paths-filter` で変わったパスを判定 |
| `rust` | `cargo test --workspace` |
| `fle` | wasm を用意し、`tsc -b`、`vitest run`、`eslint` |
| `logconv` | `tsc -b`、`vitest run`、`eslint` |
| `myact` | `tsc -b`、`vitest run --passWithNoTests`、`eslint` |
| `parks` | 公園区域 TopoJSON の検証と生成ツールのテスト(`tools/jaffpota`。[park-areas.md](park-areas.md)) |
| `build` | アプリをビルドし、`scripts/assemble.sh` で出力を作り、artifact に上げる |
| `deploy-sotalive` | プロジェクト `sotalive` へ(`dist`) |
| `deploy-legacy` | `sotalive-myact`、`sotalive-myqth` へ(matrix)。`parks`・`myqth` を待つ |
| `deploy-fle` | `sotalive-fle` へ(`pages/fle` で実行) |

## パスの判定

`changes` ジョブの出力で、各ジョブの `if` が決まります。`all` が真なら全部走ります。

| 出力 | 対象のパス | 走るもの |
|---|---|---|
| `all` | `.github/workflows/**`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`turbo.json`、`Cargo.toml`、`Cargo.lock`、`packages/shared/**`、`scripts/**` | すべて |
| `rust` | `crates/**` | rust |
| `fle` | `apps/fle/**`、`crates/**`、`pages/fle/**` | fle、deploy-fle |
| `logconv` | `apps/logconv/**` | logconv |
| `myact` | `apps/myact/**` | myact |
| `myqth` | `apps/myqth/**`、`packages/geo/**` | myqth、deploy-legacy |
| `legacy` | `apps/myact-org/**`、`apps/myqth-org/**` | deploy-legacy |
| `parks` | `tools/jaffpota/**`、`packages/shared/common/js/myact.js` | parks |
| `sotalive` | `functions/**`、`wrangler.toml`、`apps/logconv/**`、`apps/myact/**`、`apps/myqth/**`、`packages/geo/**` | deploy-sotalive |

`build` は、`all` か、`rust` 以外のどれかが真のときに走ります。ドキュメントだけの変更では、ビルドもデプロイも走りません。

## artifact

`build` が4つ上げ、各デプロイが必要なものを落とします。保存は3日です。

| 名前 | 中身 | 使うジョブ |
|---|---|---|
| `dist` | プロジェクト `sotalive` の出力 | deploy-sotalive |
| `dist-myact` | 旧版 MyActivation | deploy-legacy |
| `dist-myqth` | MyQTH(新版) | deploy-legacy |
| `dist-fle` | FLE Online | deploy-fle |

`dist-myact` と `dist-fle` には `_redirects` などの隠しファイルが入るので、`include-hidden-files: true` を付けています。
出力は `scripts/assemble.sh` と `scripts/build-static-projects.sh` が作ります。

## キャッシュ

- pnpm: `actions/setup-node` の `cache: 'pnpm'`。
- Rust: `Swatinem/rust-cache`。
- FLE の wasm: `.github/actions/fle-wasm`(自作の composite action、複数のステップをまとめたもの)。
  - `apps/fle/src/wasm/fle` を、`crates/**`、`Cargo.toml`、`Cargo.lock` のハッシュをキーにキャッシュします。
  - キャッシュがあれば Rust も wasm-pack も入れません。なければ `wasm-pack build` でビルドします。
  - 使うのは `fle` と `build` です。

キャッシュがあれば、全体で約1分半です。

## デプロイの条件と先

- 条件: push であること、待つジョブに失敗か中止がないこと、対応するパスが変わったこと(または `all`)。
- コマンド: `npx --yes wrangler@4.54.0 pages deploy ... --branch=<ブランチ名>`。wrangler の版は `ci.yml` の `env.WRANGLER` で固定しています。
- `main` へのデプロイが本番になり、それ以外のブランチは、Pages のプレビュー(`<ブランチ>.<プロジェクト>.pages.dev`)になります。
- `deploy-fle` だけ `pages/fle` で実行します。`pages/fle/wrangler.toml` の KV の束縛と `functions/` を使うためです。
- `deploy-legacy` は出力のディレクトリの中で実行します。ルートの `functions/` と `wrangler.toml` を拾わないためです。Functions なしで出せて、無料枠を使いません。

## Secrets

GitHub の Settings > Secrets and variables > Actions に登録します。

| 名前 | 内容 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Pages を編集できる API トークン |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |

作り方は [deploy-guide.md](deploy-guide.md) にあります。

## ジョブを足すとき

例として、新しいアプリ `foo`(`apps/foo`、Pages プロジェクト `sotalive-foo`)を足します。

1. `changes` の `outputs` に `foo` を足し、`filters` に `foo:` と `apps/foo/**` を足します。
2. テストが要るなら、`myact` のジョブをまねて `foo` ジョブを足します(`if` に `all` と `foo`)。
3. `build` の `if` に `needs.changes.outputs.foo == 'true'` を足し、ビルドのコマンドに `foo` を足します。
4. 出力のディレクトリ(例: `dist-foo`)を作るように `scripts/build-static-projects.sh` を直し、`build` に `upload-artifact` を足します(隠しファイルがあれば `include-hidden-files: true`)。
5. `deploy-foo` を足します。`deploy-legacy` をまねて、`needs` に `changes`、`build`、`foo` を入れます。
6. Cloudflare でプロジェクト `sotalive-foo` を作ります([deploy-guide.md](deploy-guide.md))。

`scripts/**` を直すと(`all` に入っているので)全部が走ります。これは仕様です。

## よくあるつまずき

| 症状 | 原因と対処 |
|---|---|
| artifact のアップロードが `ECONNRESET` で失敗する | GitHub 側の通信切断です。Actions の画面で「Re-run failed jobs」を押します。 |
| ドキュメントだけ直したのに何も走らない | 仕様です。`build` もデプロイも、関係するパスが変わったときだけ走ります。 |
| デプロイが「skipped」になる | 待つテストが失敗か中止です。または、PR のためデプロイしない条件(push のみ)です。 |
| デプロイで認証エラーになる | Secrets の名前の間違いか、API トークンの権限不足です。 |
| 続けてマージしたら一方が走らない | 同じブランチは1本ずつです。後の実行を待ってください。 |
| 新しいアプリを足したのにデプロイされない | `changes` の出力か `needs` の足し忘れです。 |
