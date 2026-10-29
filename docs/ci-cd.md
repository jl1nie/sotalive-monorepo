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
| `fle` | wasm を用意し、`tsc -b`、Vitest(PR では関係分だけ。下の「fle のテストの範囲」)、`eslint` |
| `logconv` | `tsc -b`、`vitest run`、`eslint` |
| `myact` | `tsc -b`、`vitest run --passWithNoTests`、`eslint` |
| `parks` | 公園区域 TopoJSON の検証と生成ツールのテスト(`tools/jaffpota`。[park-areas.md](park-areas.md)) |
| `functions` | Pages Functions のテスト(`packages/functions-test`): `functions/_middleware.ts` の振り分けと、FLE の同期(KV)・中継・アプリとの約束(アプリが送る設定・予定を、サーバーが受け取れるか) |
| `build` | アプリをビルドし、`scripts/assemble.sh` で出力を作り、artifact に上げる |
| `deploy-sotalive` | プロジェクト `sotalive` へ(`dist`) |
| `deploy-legacy` | `sotalive-myact`、`sotalive-myqth` へ(matrix)。`parks`・`myqth` を待つ |
| `deploy-fle` | `sotalive-fle` へ(`pages/fle` で実行)。`fle`・`functions` を待つ |

## パスの判定

`changes` ジョブの出力で、各ジョブの `if` が決まります。`all` が真なら全部走ります。

| 出力 | 対象のパス | 走るもの |
|---|---|---|
| `all` | `.github/workflows/**`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`turbo.json`、`Cargo.toml`、`Cargo.lock`、`packages/shared/**`、`scripts/**` | すべて |
| `rust` | `crates/**` | rust |
| `fle` | `apps/fle/**`、`crates/**`、`pages/fle/**` | fle、deploy-fle |
| `logconv` | `apps/logconv/**` | logconv |
| `myact` | `apps/myact/**` | myact |
| `functions` | `functions/**`、`packages/functions-test/**`、`pages/fle/functions/**`、`apps/fle/src/**` | functions(deploy-sotalive・deploy-fle が待つ) |
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

## fle のテストの範囲

`fle` のジョブの Vitest は、`scripts/fle-test.sh` が、変わった箇所に応じて範囲を決めます。FLE のテスト(特に `FleEditor.test.tsx`、約 40 秒)は、関係のない変更では走らせません。

| 場面 | 範囲 |
|---|---|
| `main`・`develop` などへの push(デプロイの前) | 全部 |
| PR で、wasm の元(`crates/`・`Cargo.*`)、`apps/fle` の設定(`package.json`・`vite.config.ts`・`tsconfig*`・`eslint.config.js`)、lock ファイル・ワークスペース、`.github/`、`scripts/` が変わった | 全部。wasm は生成物(git に入れない)なので、変わったファイルから、どのテストが関係するかをたどれない |
| PR で、`apps/fle/src` が変わった | 変わったファイルを読み込むテストだけ(`vitest related <変わったファイル>`。Vitest が import をたどる)。`apps/fle/src` のファイルを消したときは、読み込んでいたテストをたどれないので全部 |
| PR で、それ以外(`pages/fle`・説明書・docs だけなど) | なし |

- 型検査(`tsc -b`)と lint は、速いので、いつも全部です。型だけを使う import(`import type`)はたどられないので、型の誤りは `tsc -b` で見つけます。
- どの範囲で走ったかは、ログの `fle-test:` の行に出ます(関係分なら、変わったファイルも出ます)。
- 変わったファイルは、スクリプトが 2 点の形(`git diff <PR の元のコミット>`)で取ります。Vitest の `--changed` は使いません。`--changed` は 3 点の形(`<元>...HEAD`)で共通の祖先が要り、CI の取得は履歴が 1 つ(shallow)なので git が失敗します。Vitest はその失敗を「変わったファイルなし」として、テストを走らせずに成功で終わっていました(#182〜#183)。
- 手元では `pnpm --filter @sotalive/fle run test:changed`(`origin/main` から変わった分。まだコミットしていない分も含む)。`scripts/verify.sh` は、今までどおり全部を走らせます。

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
