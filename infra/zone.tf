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
