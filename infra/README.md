# infra — Cloudflare の構成(OpenTofu)

Cloudflare の Pages プロジェクト・カスタムドメイン・KV を、コンソールの手作業ではなくコードで持つ。
**Fly.io(バックエンド)は対象外**(`fly.toml` とバックエンドのリポジトリで持つ)。

## 状態

骨組みだけ(プロバイダー・state の置き場所)。リソースは、実物を `tofu import` して `plan` が差分なしになることを確かめながら足す。

## 準備(一度だけ)

1. OpenTofu を入れる: `brew install opentofu`
2. `cp infra/.env.example infra/.env` → 値を埋める(取り方は `.env.example` の中)
3. `source infra/.env && tofu -chdir=infra init`

## 日々の使い方

```bash
source infra/.env && tofu -chdir=infra plan    # 差分を見る
source infra/.env && tofu -chdir=infra apply   # 反映(plan を読んでから)
```

## 約束

- `infra/.env` は **コミットしない・会話に貼らない**。tofu は人が走らせ、plan の出力だけを共有する
- **管理しないもの**: デプロイ(GitHub Actions の `wrangler pages deploy`)、秘密の値(Pages の環境変数の値、API トークン)、KV の中身
- state は R2 のバケット `sotalive-tfstate`。バケットの削除・上書きは、state を失うのでしない
