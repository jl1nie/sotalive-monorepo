# デプロイの手順書(自分のアカウントで作る)

この文書は、GitHub Actions + Cloudflare Pages + Fly.io の組み合わせで、この環境を自分のアカウントに作る手順です。
初めてマルチクラウド(複数のクラウドサービスを組み合わせる構成)で出す人を想定しています。
`<...>` は自分の値に置き換えます。ID やトークンは、この文書にも Git にも書かないでください。

## 1. 全体像

何をどこに置くかです。

```
利用者のブラウザ
   |
   +-- 静的なファイル(HTML・JS・CSS) --> Cloudflare Pages (プロジェクトが4つ)
   |                                         |
   |                                         +-- Functions(/api だけ) --> Fly.io の API
   +-- API(/api/v2/...) ------------------------------------------------> Fly.io (sotaapp2)

GitHub  --(push)--> GitHub Actions --(wrangler)--> Cloudflare Pages
sotaapp2 の GitHub --(push)--> Actions --> Docker Hub(イメージ) --(手動の Deploy)--> Fly.io
```

| 置くもの | 場所 |
|---|---|
| フロントエンドのソース | GitHub(このリポジトリ) |
| テストとビルドとデプロイ | GitHub Actions |
| 静的なファイルと、軽い中継(Functions) | Cloudflare Pages |
| 設定の同期の保存(FLE) | Cloudflare Workers KV |
| API サーバーと DB(SQLite) | Fly.io |
| API サーバーの Docker イメージ | Docker Hub |
| 利用者の認証 | Firebase |
| DNS | Cloudflare |

本番のホスト名とプロジェクトの対応です。

| ホスト名 | Pages プロジェクト |
|---|---|
| myact・www | `sotalive-myact` |
| myqth | `sotalive-myqth` |
| fleonline | `sotalive-fle` |
| logconv2・myact2・myqth2 | `sotalive` |

公開するアプリを別プロジェクトにするのは、Functions の無料枠(アカウント全体で1日10万リクエスト)を、静的なファイルの配信で使わないためです。静的なファイルの配信は、無料で回数の制限がありません。

## 2. 用意するもの

| サービス | 何に使うか |
|---|---|
| GitHub | ソースと Actions。公開リポジトリなら標準のランナーは無料 |
| Cloudflare | Pages、KV、DNS |
| Fly.io | API サーバー(クレジットカードの登録が要ります) |
| Docker Hub | API サーバーのイメージの置き場所 |
| Firebase | API の認証に使う API キーを得る |

手元のツールです。

| ツール | 用途 |
|---|---|
| git、`gh`(任意) | リポジトリの操作 |
| Node 20 と pnpm 10 | フロントエンドのビルド |
| Rust(`wasm-pack` も) | FLE の wasm のビルド(手元で動かすとき) |
| `flyctl` | Fly.io の操作 |
| `wrangler` | Cloudflare の操作(`npx wrangler@4.54.0` で足ります) |

2つのリポジトリを自分のアカウントにフォークします。

- このリポジトリ(フロントエンド)
- [jl1nie/sotaapp2](https://github.com/jl1nie/sotaapp2)(バックエンド)

## 3. バックエンドを出す

詳しくは sotaapp2 の `docs/deployment-manual.md` を読んでください。ここでは最短の流れだけ書きます。

### 3-1. Docker Hub にイメージを置く

1. Docker Hub でアクセストークンを作ります(Account Settings > Personal access tokens)。
2. フォークした sotaapp2 の Settings > Secrets and variables > Actions に登録します。
   - `DOCKERHUB_USERNAME`
   - `DOCKERHUB_TOKEN`
3. sotaapp2 の `.github/workflows/ci.yml` と `deploy.yml` の `IMAGE_NAME`(`jl1nie/sotaapp2`)を、自分の `<ユーザー名>/sotaapp2` に直します。
4. main に push すると、CI がテストとビルドをして、イメージ(`latest` と短い SHA のタグ)を Docker Hub に上げます。

### 3-2. Fly.io のアプリとボリュームを作る

先に、`fly.toml` を自分用に直します(`fly` のコマンドは、このファイルの `app` を対象にします)。

- `app = '<APP_NAME>'`
- `[build] image = '<Docker Hub のユーザー名>/sotaapp2:latest'`
- `primary_region`(東京は `nrt`)

```bash
fly auth login
cd sotaapp2
fly apps create <APP_NAME>
fly volumes create data --region nrt --size 1
```

`[[mounts]]` の `source = 'data'` は、いま作ったボリューム名と同じにします。

### 3-3. Firebase の API キーを得る

Firebase コンソールでプロジェクトを作り、Web の API キーを控えます。API キーは `FIREBASE_API_KEY` に使います。

### 3-4. secrets を設定する

必須は4つです。ほかの設定は sotaapp2 の `.env.example` を見てください。

```bash
fly secrets set \
  DATABASE_URL="sqlite:/data/sotaapp2.db" \
  FIREBASE_API_KEY="<FIREBASE_API_KEY>" \
  APRSUSER="<YOURCALL-10>" \
  APRSPASSWORD="<APRS_PASSCODE>"
```

- `APRSPASSWORD` は APRS-IS のパスコードです。`.env.example` にある生成サイトで作ります。
- `CORS_ORIGIN` は1つのオリジンだけ指定できます。決めなければ、すべての接続元を許します。
- DB のファイルがなければ、起動時に作ってマイグレーションを流します。

### 3-5. 最初のデプロイ

```bash
fly deploy --image <Docker Hub のユーザー名>/sotaapp2:latest --wait-timeout 300
```

以後は、sotaapp2 の Actions の Deploy ワークフローを手で実行して出します。この場合は `FLY_API_TOKEN` を sotaapp2 の Secrets に登録します。

```bash
fly tokens create deploy -a <APP_NAME>
```

出てきた値を `FLY_API_TOKEN` として登録します(画面や履歴に残さないでください)。

### 3-6. ヘルスチェック

```bash
curl -i https://<APP_NAME>.fly.dev/api/v2/health
fly logs --no-tail | tail -50
```

200 が返れば成功です。返らなければ、ログを見て secrets を確かめます。

### 3-7. 独自ドメイン

```bash
fly certs add api.<自分のドメイン> -a <APP_NAME>
fly certs show api.<自分のドメイン> -a <APP_NAME>
```

`certs show` が示す DNS レコードを、Cloudflare の DNS に作ります。このとき、プロキシは切り(「DNS のみ」の灰色の雲)にしておくと、証明書の発行が確実です。
旧版の MyActivation・MyQTH は、ソースの中で API のホスト名を `sotaapp2.sotalive.net` と書いています。自分のドメインを使うなら、`apps/myact-org`、`apps/myqth-org`、`packages/shared` の中を検索して、置き換えてください。
Functions(`functions/_middleware.ts` と `pages/fle/functions/api/v2/[[path]].ts`)の中継先は、Pages のプロジェクト(`sotalive` と `sotalive-fle`)の環境変数 `BACKEND_URL` で決めます(例: `https://<APP_NAME>.fly.dev`)。Cloudflare のダッシュボードで、プロジェクトの「設定」→「変数とシークレット」に、本番用として登録します。設定しなければ、ソースの中の公開ドメイン(`PUBLIC_BACKEND_URL`)を使います。Fly.io のアプリの URL は、リポジトリに書かないでください。

## 4. Cloudflare Pages のプロジェクトを作る

プロジェクトは4つ作ります。デプロイの前に、空のプロジェクトが必要です。

```bash
npx wrangler@4.54.0 login
npx wrangler@4.54.0 pages project create sotalive        --production-branch=main
npx wrangler@4.54.0 pages project create sotalive-myact  --production-branch=main
npx wrangler@4.54.0 pages project create sotalive-myqth  --production-branch=main
npx wrangler@4.54.0 pages project create sotalive-fle    --production-branch=main
```

- 名前は `.github/workflows/ci.yml` の `--project-name` と同じにします。変えるなら、`ci.yml` も直します。
- プロジェクトの名前は、自分のアカウントの中で決めます。ただし `*.pages.dev` のサブドメインはすべての利用者で共通なので、取られていると `sotalive-myact-xxx.pages.dev` のように後ろに文字が付きます。作ったあとに表示される実際のサブドメインを控え、手順9の CNAME はそこへ向けます。
- 名前を変えたら、`ci.yml` の `--project-name` と `pages/fle/wrangler.toml` の `name` を合わせます。
- アカウント ID は、Cloudflare のダッシュボードの右側か、`npx wrangler@4.54.0 whoami` で分かります。

## 5. KV の名前空間を作る

FLE Online の設定の同期に使います。

```bash
npx wrangler@4.54.0 kv namespace create FLE_PREFS
```

出力に ID が出ます。`pages/fle/wrangler.toml` の `id` を、自分の ID に置き換えます。

```toml
[[kv_namespaces]]
binding = "FLE_PREFS"
id = "<KV_NAMESPACE_ID>"
```

リポジトリに入っている ID は元の持ち主のものです。そのままだと、あなたのアカウントでは使えません。
KV の ID は秘密ではありませんが、公開したくなければ、そのような運用にしてください。

## 6. API トークンを作る

GitHub Actions が Pages にデプロイするためのトークンです。

1. Cloudflare のダッシュボードで My Profile > API Tokens > Create Token を開きます。
2. 「Create Custom Token」を選びます。
3. 権限は **Account > Cloudflare Pages > Edit** です。
4. Account Resources は、自分のアカウントだけにします。
5. 作ったら、値を一度だけ表示します。控えて、次の手順で登録します。

必要なのは Pages の編集だけです。次の権限は不要です。

- DNS は Actions からは触らないので、不要です。DNS は手で(またはダッシュボードで)設定します。
- KV の ID は `wrangler.toml` に書くだけで、デプロイ時にその名前空間は作りません。

注意:

- `wrangler login`(OAuth)で得る権限では、DNS を触れません。DNS を API で触りたいなら、別に **Zone > DNS > Edit** のトークンが要ります。この手順書では、DNS は手作業で十分です。
- トークンは、チャットやコミットに貼らないでください。貼ってしまったら、すぐ作り直します。

## 7. GitHub の Secrets を登録する

フロントエンドのリポジトリ(フォーク)に登録します。

```bash
gh secret set CLOUDFLARE_API_TOKEN   --repo <ユーザー名>/sotalive-monorepo
gh secret set CLOUDFLARE_ACCOUNT_ID  --repo <ユーザー名>/sotalive-monorepo
```

値は、プロンプトに貼ります。ダッシュボードなら Settings > Secrets and variables > Actions > New repository secret です。

| 名前 | 値 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 手順6のトークン |
| `CLOUDFLARE_ACCOUNT_ID` | `<ACCOUNT_ID>` |

## 8. 最初のデプロイ

フォークしたリポジトリでは、最初は Actions が止まっています。リポジトリの Actions のタブを開き、ワークフローを有効にします。

そのあと main に push します(`.github/workflows` を変えると、全部が走ります)。

```bash
git push origin main
```

- Actions の画面で `CI` を開き、ジョブの流れを確かめます([ci-cd.md](ci-cd.md))。
- 成功すると、各プロジェクトに `https://<プロジェクト名>.pages.dev` ができます。
- main 以外のブランチに push すると、プレビューになります。

デプロイが飛ばされる場合は、変わったパスが条件に合っていません。`.github/workflows/ci.yml` を少し直して push すれば、全部が走ります。

## 9. 独自ドメインを付ける

プロジェクトごとにドメインを付けます。

1. Cloudflare のダッシュボードで Workers & Pages > 対象のプロジェクト > Custom domains > Set up a custom domain を開きます。
2. ホスト名(例: `myact.<自分のドメイン>`)を入れます。
3. DNS が Cloudflare にあれば、CNAME が自動で作られます。なければ、自分で CNAME を作ります。

| 種類 | 名前 | 向き先 |
|---|---|---|
| CNAME | `myact` | `sotalive-myact.pages.dev` |
| CNAME | `myqth` | `sotalive-myqth.pages.dev` |
| CNAME | `fleonline` | `sotalive-fle.pages.dev` |
| CNAME | `myact2`、`myqth2`、`logconv2` | `sotalive.pages.dev` |

`sotalive` の `functions/_middleware.ts` は、ホスト名で振り分けます。ホスト名(`myact2`、`myqth2`、`logconv2`)を変えるなら、そのファイルも直します。

登録の直後は、数分間、522 エラーやドメインの「pending」(確認待ち)になります。しばらく待ちます。

## 10. 確かめ方

ホスト名ごとに、curl で確かめます。

```bash
# バックエンド
curl -i https://<APP_NAME>.fly.dev/api/v2/health

# 静的なファイル(各プロジェクト)
curl -sI https://sotalive-myact.pages.dev/  | head -n 5
curl -sI https://sotalive-myqth.pages.dev/  | head -n 5
curl -sI https://sotalive-fle.pages.dev/fle/ | head -n 5

# FLE の中継(Functions)
curl -i https://sotalive-fle.pages.dev/api/v2/health

# 独自ドメイン
curl -sI https://myact.<自分のドメイン>/ | head -n 5
```

- 200 が返れば成功です。FLE の `/` は `/fle/` への転送(リダイレクト)になります。
- 新しい画面が出ているかは、本番の `index-*.js` を取って、新しい文言を `grep` して確かめます。

## 11. よくあるつまずき

| 症状 | 原因と対処 |
|---|---|
| 522 や pending が続く | 登録直後は数分かかります。10 分以上続くなら、CNAME の向き先とプロジェクトの紐づけを確かめます。 |
| 無料枠を超えそう | Functions は1日10万リクエスト(アカウント全体)です。公開アプリを別プロジェクトにし、Functions を必要なパスだけにします。 |
| 古い画面が出る(PWA) | PWA(ホーム画面に入れたアプリ)は古いファイルを持ち続けます。iPhone では、アプリを完全に閉じて(アプリ切り替えで上に払って)開き直します。 |
| artifact で `ECONNRESET` | GitHub 側の通信切断です。「Re-run failed jobs」で直ります。 |
| DNS を `wrangler` で触れない | `wrangler login`(OAuth)には DNS の権限がありません。ダッシュボードで設定するか、Zone > DNS > Edit のトークンを別に作ります。 |
| デプロイで「project not found」 | 手順4のプロジェクトがない、または名前が `ci.yml` と違います。 |
| FLE の設定の同期が動かない | `pages/fle/wrangler.toml` の KV の ID が、自分のアカウントのものになっていません。 |
| API が CORS で弾かれる | `CORS_ORIGIN` が1つのオリジンだけです。複数のアプリから呼ぶなら、設定しないか、中継(Functions)を使います。 |
| Fly.io のデプロイが失敗する | `fly logs`。必須の secrets が足りないと起動しません。 |

## 12. 無料枠の目安

料金や上限は変わります。必ず、各サービスの最新の案内を確かめてください。以下は書いた時点の目安です。

| サービス | 目安 |
|---|---|
| Cloudflare Pages | 静的なファイルの配信は、無料で回数の制限なし。ビルド数やファイル数に上限あり |
| Pages Functions | 1日10万リクエスト(アカウント全体) |
| Workers KV | 無料枠あり(読み取りと書き込みに日ごとの上限) |
| GitHub Actions | 公開リポジトリは標準のランナーが無料。非公開は月ごとの分数の上限 |
| Fly.io | 有料になる可能性があります。マシン、ボリューム、通信量に課金されます。使う前に料金表を確かめてください |
| Docker Hub | 公開イメージの置き場所は無料の範囲あり(取得回数に制限) |
| Firebase | 認証の無料枠あり |

関連: [backend.md](backend.md)、[ci-cd.md](ci-cd.md)
