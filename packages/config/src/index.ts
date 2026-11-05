/**
 * 各アプリ・Functions が共有する設定。バックエンド(sotaapp2)の公開ドメインは、ここに 1 か所だけ書く。
 *
 * - 公開ドメインは、DNS(infra/zone.tf)で Fly.io などの実体に向ける。バックエンドを移すときは、URL でなく DNS の向き先を変える
 * - Fly.io のアプリの URL(*.fly.dev)は、リポジトリに書かない
 * - Functions は、Pages の環境変数 BACKEND_URL があればそちらを優先する(なければここ)
 */
export const BACKEND_ORIGIN = 'https://sotaapp2.sotalive.net'

/** API のベース(`/api/v2`)。末尾に `/` を付けない */
export const API_BASE = `${BACKEND_ORIGIN}/api/v2`
