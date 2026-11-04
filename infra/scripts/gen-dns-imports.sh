#!/usr/bin/env bash
# DNS のレコードの ID を調べて、import ブロックを imports-dns.tf に書く。
#   source infra/.env && infra/scripts/gen-dns-imports.sh
# 読み取りだけ。ID は秘密ではないが、取り込みが済んだら imports-dns.tf は消してよい。
set -euo pipefail
: "${CLOUDFLARE_API_TOKEN:?infra/.env を source してから}" "${TF_VAR_cloudflare_zone_id:?}"
out="$(dirname "$0")/../imports-dns.tf"
curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$TF_VAR_cloudflare_zone_id/dns_records?type=CNAME&per_page=100" |
  jq -r '.result[] | select(.content | endswith(".pages.dev"))
         | "import {\n  to = cloudflare_dns_record.pages[\"\(.name)\"]\n  id = \"${var.cloudflare_zone_id}/\(.id)\"\n}\n"' > "$out"
echo "$(grep -c '^import' "$out") 件を $out に書いた(pages.dev 向けの CNAME だけ。Fly.io 向けは含めない)"
