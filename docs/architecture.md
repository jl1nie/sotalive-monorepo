# 全体の構成

sotalive は、Cloudflare Pages の4つのプロジェクトと、Fly.io のバックエンド(sotaapp2)でできています。
この文書では、ホスト名の振り分けとリクエストの流れを説明します。

## 用語

- **Cloudflare Pages**: 静的ファイルを配信するホスティング。プロジェクト単位でデプロイします。
- **Pages Functions**: Pages に付けられるサーバー側のコード(Cloudflare Workers の一種)。
- **CNAME**: ホスト名を別のホスト名へ向ける DNS レコード。
- **KV**: Cloudflare のキー・バリュー型の保存先。

## ホスト名とプロジェクトの対応

| ホスト名 | Pages プロジェクト | 出力ディレクトリ | Functions |
|---|---|---|---|
| myact / www .sotalive.net | sotalive-myact | `dist-myact` | なし |
| myqth.sotalive.net | sotalive-myqth | `dist-myqth` | なし |
| logconv.sotalive.net | sotalive-logconv | `dist-logconv` | `/api` の下だけ(`pages/logconv/functions`。バックエンドへの中継のみ) |
| fleonline.sotalive.net | sotalive-fle | `dist-fle` | `/api` の下だけ(`pages/fle/functions`) |
| myact2.sotalive.net | sotalive-myact2 | `dist-myact2` | なし(試験中。`_headers` で `noindex`) |
| myqth2.sotalive.net | sotalive | `dist` | `functions/_middleware.ts` が全パスにかかる |

## プロジェクトを分けた理由

Pages Functions の無料枠は、アカウント全体で1日10万リクエストです。
静的ファイルの配信は無料で、回数の制限もありません。
ただし Functions がサイト全体にかかると、静的ファイルへのアクセスも枠を使います。

そこで、公開しているアプリは別プロジェクトにしました。
Functions は必要なパス(FLE の `/api`)だけに置きます。
Functions を全体にかけているのは、まだ公開していない myqth2 のプロジェクト(sotalive)だけです。

## リクエストの流れ

### 静的ファイル(myact 旧版・myqth)

1. ブラウザが `myact.sotalive.net` を引くと、CNAME で `sotalive-myact.pages.dev` に着きます。
2. Pages が `dist-myact` のファイルをそのまま返します。Functions は動きません。
3. ないパスは 404 です(`404.html` を置いているため)。

### FLE Online

- `/fle/` の下に静的ファイルがあります。`/` は `_redirects` で `/fle/` へ 302 で転送します。
- `/api/v2/*` は `pages/fle/functions/api/v2/[[path]].ts` がバックエンドへ中継します(中継先は、プロジェクトの環境変数 `BACKEND_URL`。なければ公開ドメイン `https://sotaapp2.sotalive.net`)。
- 設定の同期は `pages/fle/functions/api/fle/prefs/[code].ts` が受け、KV(束縛名 `FLE_PREFS`)に保存します。KV の束縛は `pages/fle/wrangler.toml` に書いてあります。

### myqth2(プロジェクト sotalive)

`functions/_middleware.ts` が、すべてのリクエストを次の順で処理します。

1. パスが `/api/` で始まれば、バックエンド(環境変数 `BACKEND_URL`。なければ `https://sotaapp2.sotalive.net`)へ中継します(`X-Forwarded-Host` に元のホスト名を入れます)。
2. ホスト名が `myqth2` で始まれば `/myqth2` を、パスの前に付けます(`myqth.sotalive.net`、本番は別のプロジェクトで、ここを通りません)。
3. そのファイルがなければ(404)、共通アセット(`/shared/common/...`)を探します。
4. myqth2 には `x-robots-tag: noindex` を付けて、検索エンジンに載せません。
5. 上のどれでもないホスト名(`sotalive.pages.dev` など)は、そのまま配信します。

新しい myqth はビルドの base が `/` なので、myqth2 のホスト名でだけ動きます。次期 MyACT(`apps/myact-next`)は専用のプロジェクト(`sotalive-myact2`。base は `/`、API はバックエンドを直接呼ぶ)で、Functions は使いません。React 版 myact(`apps/myact`)は凍結で、出しません。この振り分けは `packages/functions-test`(`ASSETS` を差し替えたテスト)で確かめます。

### 旧版が API を直接呼ぶこと

旧版の myact・myqth は Functions を持ちません。
API はバックエンドの独自ドメイン `sotaapp2.sotalive.net`(Fly.io)を、ブラウザから直接呼びます。
そのため、バックエンド側で CORS(別のオリジンからの呼び出しの許可)の設定が要ります。
詳しくは [backend.md](backend.md) を見てください。

## DNS

`sotalive.net` のゾーンは Cloudflare にあります。
各ホスト名は CNAME で、対応するプロジェクトの `<project>.pages.dev` を指します。
例: `myact` -> `sotalive-myact.pages.dev`。

## ビルドの出力

`pnpm run build` は、アプリをビルドしてから `scripts/assemble.sh` を呼びます。

| 出力 | 作るもの | 中身 | 行き先 |
|---|---|---|---|
| `dist` | `scripts/assemble.sh` | `myqth2/`、`shared/`、`functions/` | sotalive |
| `dist-myact` | `scripts/build-static-projects.sh` | 旧版 myact の `index.html`、共通アセット、404.html、`_redirects` | sotalive-myact |
| `dist-myact2` | 同上 | 次期 MyACT(`apps/myact-next/dist`)、使う共通アセット(JAFF/POTA 区域の JSON・ファビコン)、404.html、`_headers` | sotalive-myact2 |
| `dist-myqth` | 同上 | 新版 myqth(`apps/myqth/dist`)、ファビコン、404.html | sotalive-myqth |
| `dist-logconv` | 同上 | LogConverter(`apps/logconv/dist`)。base は `/` | sotalive-logconv |
| `dist-fle` | 同上 | `fle/`(FLE のビルド)、`_redirects` | sotalive-fle |

`assemble.sh` の最後で `build-static-projects.sh` が呼ばれます。
`dist-myact/_redirects` は、`www.sotalive.net/logconv` 以下を `logconv.sotalive.net` へ 302 で転送します。

デプロイの流れは [ci-cd.md](ci-cd.md)、自分の環境の作り方は [deploy-guide.md](deploy-guide.md) を見てください。
