# FLE Online

FLE Online は、山や公園での運用ログをスマホで書き、SOTA・POTA・HAMLOG 用のファイルに変換するアプリです。
FLE は Fast Log Entry の略で、1 行に 1 QSO を短く書くログの書き方です。

- 公開先: https://fleonline.sotalive.net/ (本番)
- 利用者向けの説明書: [apps/fle/public/manual/index.html](../../apps/fle/public/manual/index.html) (英語版は `public/manual/en`)

## 機能

利用者向けの説明書の流れを、次のように要約します。使い方の細部は説明書を読んでください。

| 場面 | できること |
|---|---|
| 出発前 | リグの一覧、タイムゾーン、画面の配置を設定します。行き先(山・公園・グリッドなど)を「予定」として登録します |
| 同期 | PC で入れた設定と予定を、QR コードか 26 文字の同期コードでスマホへ写します。ログの本文は同期しません |
| 山頂 | `40m cw` / `0230 ja1abc` のように 1 行 1 QSO で書きます。入力欄の下の候補バーが、行の解釈(橙: 入力中、緑: 解釈できた、赤: 誤り)を見せます |
| 直す | 候補バーのコール・RST・時刻を押すと、その位置へキャレットが移ります |
| 運用後 | 「書き出し」で、各形式のファイルを入れた zip を作ります |

画面の配置は 3 種類あります(コンパクトとフルキーは試験中)。

- 従来: OS のキーボードを使います。
- コンパクト: 打っている行・候補バー・数字キーを手元にまとめます。
- フルキー: OS のキーボードの代わりに、FLE を打つのに要るキーだけの画面キーボードを出します。

電波のない山頂でも書けるように、PWA(後述)としてホーム画面に追加して使います。
山・公園の候補検索と同期だけは、電波が要ります。

### 出力する形式

`crates/fle-core/src/output.rs` の `generate_fle_output` が、zip の中に次のファイルを作ります。

| ファイル | 内容 |
|---|---|
| `sotaYYYYMMDD.csv` | SOTA のログ(山の QSO のみ。UTC の日付ごと)。S2S があれば `sota-s2s-….csv` も |
| `コールサイン@公園-日付.adi` | POTA の ADIF(公園・日付ごと)。WWFF も同様 |
| `hamlog-….csv` | HAMLOG の取り込み用 CSV |
| `airham-….csv` | AirHam 用 CSV |
| `contest-日付.txt` | ZLOG 形式(コンテストのログのとき) |

エラーのある行があると、これらは作られず、エラーを書いたテキストだけが出ます。
ほかのログソフトの形式を変換したいときは [logconv](logconv.md) を使います。
FLE のログそのものは、「FLEログを保存」でテキストにできます。
ADIF を FLE の行へ戻す機能(`adifToFle`)もあり、メニューの「ADIFを追加」から使います。

## 技術的な特徴

### Rust の解析器を WASM で動かす

FLE の文法の処理は、すべて Rust で書いた `crates/fle-core` にあります。
画面は、これを WASM(ブラウザで動く機械語に近い形式)にした `crates/fle-wasm` を呼びます。
サーバーには送りません。変換はブラウザの中で完結します。

- 文法はコア、動作は画面、という分担です。コアは時計も保存先も持たず、「いまの時刻」は引数で受け取ります。
- 位置は UTF-16 の文字位置で受け渡します(日本語や絵文字があってもずれません)。
- `fle-wasm` が公開する関数: `compile`、`complete`(補完)、`fill`、`selectPart`、`adifToFle`、`sampleLog` など。

文法と画面との取り決めの詳細は、次を参照してください。

- [docs/fle-grammar.md](../fle-grammar.md): FLE の文法
- [docs/fle-protocol.md](../fle-protocol.md): コアと画面のプロトコル

### React と画面のキーボード

- React 19、TypeScript、Vite 7、Tailwind CSS 4。テストは Vitest と Testing Library。
- 画面のキーボードは `apps/fle/src/components/FullKeyboard.tsx`、数字キーの行は `DigitRow.tsx` にあります。
- 設定は端末の保存領域に持ちます(`hooks/useSettings.ts`、`lib/storage.ts`)。書いたログは自動保存します(`hooks/useAutosave.ts`)。

### PWA(オフラインで動く)

PWA は、ホーム画面に追加でき、オフラインでも動く Web アプリです。
`apps/fle/vite.config.ts` の `vite-plugin-pwa` で設定しています。

| 項目 | 内容 |
|---|---|
| 範囲 | `base`・`scope`・`start_url` はすべて `/fle/` |
| 事前キャッシュ | ハッシュ付きの JS・CSS・WASM・フォント・アイコンなど(HTML は含めない) |
| 画面(HTML) | `NetworkFirst`。つながれば常に最新。3 秒待ってだめならキャッシュ(山頂など) |
| `/fle/assets/` | `CacheFirst`。読み込んだものをその場で保存し、電波が切れても組み上がるようにする |
| 更新 | 新しい Service Worker はすぐ入れ替える(`skipWaiting`、`clientsClaim`)。利用者に確認はしない。開き直せば最新になる |
| 版の確認 | ビルド時にコミットの短い番号を埋め込む(環境変数 `APP_VERSION` でも指定できる) |

### 設定の同期(Cloudflare KV)

`pages/fle/functions/api/fle/prefs/[code].ts` が、設定と予定の同期を受け持ちます。
アカウントはありません。端末が作る長いランダムな文字列(同期コード)が、そのまま鍵です。

| メソッド | 動作 |
|---|---|
| `GET /api/fle/prefs/<コード>` | 保存内容を返す(なければ 404) |
| `PUT /api/fle/prefs/<コード>` | 保存する。クライアントが最後に見た版(`base`)と違えば 409 と、サーバーの内容を返す(マージはクライアント) |
| `DELETE /api/fle/prefs/<コード>` | 消す |

- 保存先は KV の束縛 `FLE_PREFS`。束縛は `pages/fle/wrangler.toml` に書きます(KV の ID はここでは書きません)。
- 同期するのは設定(リグ、タイムゾーン、言語など)と予定だけです。ログの本文は保存しません。
- 本文は 32 KB まで。形を検査し、知っている項目だけを残します。
- 使われなくなったデータは、最後の PUT から 400 日で消えます。

### バックエンドへの中継

FLE は、山・公園の候補検索で `/api/v2` を呼びます(`apps/fle/src/lib/reference.ts`)。
`pages/fle/functions/api/v2/[[path]].ts` が、これをバックエンド(環境変数 `BACKEND_URL`。なければ `https://sotaapp2.sotalive.net`)へそのまま中継します。
Functions は `/api` の下だけに置いてあるので、画面などの静的ファイルの配信は Functions の無料枠を使いません。

## ディレクトリとおもなファイル

```
apps/fle/                 画面(React)
  index.html
  vite.config.ts          PWA・base・開発サーバーの設定
  public/manual/          利用者向けの説明書(index.html)
  public/icons/           PWA のアイコン
  src/App.tsx
  src/components/         画面部品(FleEditor、FullKeyboard、DigitRow、各 Sheet など)
  src/hooks/             useSettings、useSync、usePwa、useRefSearch など
  src/lib/               fle.ts(WASM の呼び出し)、sync.ts、reference.ts、storage.ts など
  src/wasm/fle/          wasm-pack の出力(ビルドで作る。Git の管理外)
crates/fle-core/          FLE の解析・補完・出力(Rust)
  src/syntax.rs           字句と構文
  src/compiler.rs         ログを QSO にする
  src/complete.rs         補完
  src/output.rs           出力形式(SOTA CSV、ADIF、HAMLOG など)
  src/adif.rs             ADIF から FLE への変換
  tests/golden.rs         以前の実装との比較
crates/fle-wasm/          wasm-bindgen で JS に公開する薄い層
pages/fle/                Pages プロジェクト用
  wrangler.toml
  functions/api/v2/[[path]].ts           バックエンドへの中継
  functions/api/fle/prefs/[code].ts      同期(KV)
```

## ビルドと配置先

| 項目 | 内容 |
|---|---|
| Pages プロジェクト | `sotalive-fle` |
| ホスト名 | `fleonline.sotalive.net` |
| 公開パス | `/fle/` (`/` は `/fle/` へ 302 転送) |
| Functions | `/api` の下だけ |

ビルドの流れは次のとおりです。

1. `wasm-pack build --target web --release --out-dir ../../apps/fle/src/wasm/fle --out-name fle` を `crates/fle-wasm` で実行し、WASM を作ります(`pnpm --filter @sotalive/fle run wasm`)。
2. `tsc -b && vite build` で `apps/fle/dist` を作ります。
3. `scripts/build-static-projects.sh` が、`apps/fle/dist` を `dist-fle/fle/` にコピーし、`dist-fle/_redirects` に `/ /fle/ 302` を書きます。
4. `pages/fle` で `wrangler pages deploy` します(`pages_build_output_dir` は `../../dist-fle`)。CI の `deploy-fle` ジョブがこれを行います。[docs/ci-cd.md](../ci-cd.md) を参照してください。

WASM のビルドには `wasm-pack` と Rust が要ります。CI では `.github/actions/fle-wasm` が、`crates/` のハッシュをキーにキャッシュします。

## 開発とテストのコマンド

```bash
# 開発サーバー(WASM をビルドしてから Vite を起動。ポート 3003、/api はバックエンドへ中継。中継先は環境変数 BACKEND_URL、なければ sotaapp2.sotalive.net)
pnpm --filter @sotalive/fle run dev

# 画面のテスト・型検査・lint
cd apps/fle
pnpm exec vitest run
pnpm exec tsc -b
pnpm run lint

# Rust のテスト(fle-core を含む)
cargo test --workspace
```

開発サーバーでは Service Worker を使いません(本番ビルドだけ)。
全体の開発手順は [docs/development.md](../development.md)、構成は [docs/architecture.md](../architecture.md) を参照してください。
