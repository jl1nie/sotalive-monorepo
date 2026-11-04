resource "cloudflare_pages_project" "this" {
  for_each = local.pages_projects

  account_id        = var.cloudflare_account_id
  name              = each.key
  production_branch = "main"
}

resource "cloudflare_pages_domain" "this" {
  for_each = local.pages_domains

  account_id   = var.cloudflare_account_id
  project_name = each.value
  name         = each.key

  depends_on = [cloudflare_pages_project.this]
}

# Pages のドメインには、DNS のレコードが自動では作られない。CNAME は proxied(オレンジの雲)
resource "cloudflare_dns_record" "pages" {
  for_each = local.pages_domains

  zone_id = var.cloudflare_zone_id
  name    = each.key
  type    = "CNAME"
  content = "${each.value}.pages.dev"
  proxied = true
  ttl     = 1 # 自動
}
