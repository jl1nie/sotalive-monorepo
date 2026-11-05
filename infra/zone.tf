# ゾーン sotalive.net の設定(Pages のドメインと CNAME は pages.tf)。
# Fly.io 向けの CNAME(admin・awards・sotaapp2)は、アプリの URL をリポジトリに書かない方針なので、ここでは持たない

# 頂点(sotalive.net)は、実体がないダミーの AAAA(100::)をプロキシして、下のリダイレクトで www に飛ばす
resource "cloudflare_dns_record" "apex" {
  zone_id = var.cloudflare_zone_id
  name    = "sotalive.net"
  type    = "AAAA"
  content = "100::"
  proxied = true
  ttl     = 1 # 自動
}

# 頂点 → www(パスは保持)。ルールセットは「ゾーンの動的リダイレクト」の 1 つ
resource "cloudflare_ruleset" "redirects" {
  zone_id = var.cloudflare_zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules = [
    {
      enabled     = true
      action      = "redirect"
      description = " apex to www"
      expression  = "(http.host eq \"sotalive.net\")"
      action_parameters = {
        from_value = {
          status_code = 301
          preserve_query_string = false
          target_url = {
            expression = " concat(\"https://www.sotalive.net\", http.request.uri.path)"
          }
        }
      }
    },
  ]
}

# 暗号化モード: オリジンの証明書を検証する(Full strict)
resource "cloudflare_zone_setting" "ssl" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "ssl"
  value      = "strict"
}

# API のレート制限。バックエンド(Fly.io の小さな 1 台)を守るための、控えめな上限。
# - 対象: sotaapp2・fleonline・logconv の /api/。キャッシュに当たった要求は数えない(requests_to_origin)
# - 数え方: IP ごと(cf.colo.id はデータセンターごとの区別で、API では必須)
# - 超えたら: 10 秒ブロック(429)。無料プランは期間 10 秒・ブロック 10 秒が上限(要 plan で確認)
# - まず緩く置いて、様子を見て調整する。しきい値は 100 回 / 10 秒 = 1 つの IP から平均 10 回/秒
resource "cloudflare_ruleset" "ratelimit" {
  zone_id = var.cloudflare_zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_ratelimit"

  rules = [
    {
      enabled     = true
      action      = "block"
      description = "API rate limit (per IP)"
      expression  = "(http.host in {\"sotaapp2.sotalive.net\" \"fleonline.sotalive.net\" \"logconv.sotalive.net\"} and starts_with(http.request.uri.path, \"/api/\"))"
      ratelimit = {
        characteristics     = ["cf.colo.id", "ip.src"]
        period              = 10
        requests_per_period = 100
        mitigation_timeout  = 10
        requests_to_origin  = true
      }
    },
  ]
}
