# FLE の設定の同期(pages/fle/wrangler.toml の FLE_PREFS)。中身は管理しない
resource "cloudflare_workers_kv_namespace" "fle_prefs" {
  account_id = var.cloudflare_account_id
  title      = "FLE_PREFS"
}
