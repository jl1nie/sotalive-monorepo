# infra — Cloudflare の構成(OpenTofu)

Cloudflare の Pages プロジェクト・カスタムドメイン・KV を、コンソールの手作業ではなくコードで持つ。
**Fly.io(バックエンド)は対象外**(`fly.toml` とバックエンドのリポジトリで持つ)。

## 状態

管理するもの: Pages プロジェクト 6 つ、Pages のカスタムドメイン 7 つとその CNAME、KV `FLE_PREFS`。
実物は import ブロック(`imports.tf`)で取り込む。`plan` の差分が、実物と定義の食い違い。

**管理しないもの**: Fly.io 向けの DNS(`admin`・`awards`・`sotaapp2`。アプリの URL をリポジトリに書かない方針)、頂点の `sotalive.net`(リダイレクトのルールとあわせて、別に決める)、メールの設定(今は無い)。

## 準備(一度だけ)

1. OpenTofu を入れる: `brew install opentofu`
2. `cp infra/.env.example infra/.env` → 値を埋める(取り方は `.env.example` の中)
3. `source infra/.env && tofu -chdir=infra init`
4. DNS の import を作る: `source infra/.env && infra/scripts/gen-dns-imports.sh`
5. `source infra/.env && tofu -chdir=infra plan` で、差分を確かめる(取り込みの 1 回目は import が並ぶ)

## 日々の使い方

```bash
source infra/.env && tofu -chdir=infra plan    # 差分を見る
source infra/.env && tofu -chdir=infra apply   # 反映(plan を読んでから)
```

## 約束

- `infra/.env` は **コミットしない・会話に貼らない**。tofu は人が走らせ、plan の出力だけを共有する
- **管理しないもの**: デプロイ(GitHub Actions の `wrangler pages deploy`)、秘密の値(Pages の環境変数の値、API トークン)、KV の中身
- state は R2 のバケット `sotalive-tfstate`。バケットの削除・上書きは、state を失うのでしない
