# 手元での開発

## 必要なツール

| ツール | 用途 |
|---|---|
| Node.js 20 | アプリのビルド・テスト |
| pnpm 10(`packageManager` で固定) | パッケージ管理。`corepack enable` でも入ります |
| Rust(stable) | FLE のコア(`crates/`)。FLE を触るときだけ |
| wasm-pack | Rust を wasm にする。FLE を触るときだけ |
| wrangler | Cloudflare Pages の手元確認とデプロイ。`pnpm install` で入ります(devDependencies) |

## 準備

```bash
pnpm install
```

## FLE の wasm

FLE は Rust の `crates/fle-core`(FLE 形式の解析・出力)を、`crates/fle-wasm` で wasm にして使います。
`pnpm --filter @sotalive/fle dev` と `build` は、先に wasm を作ります(`apps/fle/package.json` の `wasm`)。
単独で作るときは次のとおりです。

```bash
cd crates/fle-wasm
wasm-pack build --target web --release --out-dir ../../apps/fle/src/wasm/fle --out-name fle
```

出力の `apps/fle/src/wasm/fle` は git 管理外です。
初回は `rustup target add wasm32-unknown-unknown` が要ることがあります。

## 各アプリの dev サーバー

| アプリ | コマンド | URL | `/api` の転送先 |
|---|---|---|---|
| logconv | `pnpm --filter @sotalive/logconv dev` | http://localhost:3002/logconv/ | `BACKEND_URL`(なければ sotaapp2.sotalive.net) |
| fle | `pnpm --filter @sotalive/fle dev` | http://localhost:3003/fle/ | `BACKEND_URL`(なければ sotaapp2.sotalive.net) |
| myact(React 版) | `pnpm --filter @sotalive/myact dev` | Vite の既定(http://localhost:5173/) | sotaapp2.sotalive.net |
| myact-org(旧版) | `pnpm run build` のあと `npx serve dist-myact` | serve が表示する URL | (旧版は API を直接呼ぶ) |

転送は各アプリの `vite.config.ts` の `server.proxy` です。
旧版の `apps/myact-org` の `dev`(`npx serve -l 3001 .`)は、共通アセット(`css/`、`js/` など)が別の場所にあるので、そのままでは画面が組み上がりません。ビルドの出力 `dist-myact` を配ってください。
ルートの `pnpm run dev` は `turbo dev` で、`dev` を持つ全パッケージを同時に起動します。
旧版(`myact-org`、`logconv-org`)も入るので、ポートが重なることがあります。個別に起動するほうが確実です。

## wrangler pages dev での確認

`functions/_middleware.ts` を含めた、本番に近い確認です。

```bash
pnpm run pages:dev     # build してから wrangler pages dev dist --port 8788
```

ホスト名での振り分けは、ブラウザで `localhost:8788` を開いても効きません(ホスト名が `localhost` のため)。
`curl -H "Host: myqth2.sotalive.net" http://localhost:8788/` のようにホストを指定して確かめます(この手順は、ここでは動作確認していません)。

FLE の Functions(`pages/fle`)は、`pages/fle/wrangler.toml` を使って、そのディレクトリで `wrangler pages dev` を実行します。KV の束縛が必要です。

## テストと lint

```bash
pnpm run test          # fle・logconv・myact の vitest
pnpm run lint:apps     # 同じ3つの eslint
cargo test --workspace # Rust(crates/)
```

## ビルドと出力の確認

```bash
pnpm run build         # build:apps(turbo)-> scripts/assemble.sh
ls dist dist-myact dist-myqth dist-fle
```

出力の意味は [architecture.md](architecture.md#ビルドの出力) にあります。
旧版だけを組み直すなら `scripts/build-static-projects.sh` を直接実行できます(`apps/fle/dist` が先に要ります)。

## Makefile.toml(cargo-make)

`makers install`、`makers dev`(`pages:dev` を呼びます)、`makers build`、`makers clean` は、上の pnpm のコマンドを呼ぶだけで、そのまま使えます。
次の点は古いので、使わないでください。

- `deploy-preview` は `--branch preview` で、CI の運用(main 以外のブランチ名)と違います。
- `lint`・`check`・`ci` は、旧版も含む `turbo lint` / `turbo typecheck` を呼びます。CI が使う `pnpm run lint:apps` とは別です。

CI が実際に何を走らせるかは [ci-cd.md](ci-cd.md) を見てください。
