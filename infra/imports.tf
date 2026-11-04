# 既にある実物を取り込む(`tofu plan` で import が読まれ、`apply` で state に入る)。
# 取り込みが済んだら、このファイルは消してよい(state に入っていれば、再度は不要)。
# DNS のレコードは ID が要るので、imports-dns.tf を `scripts/gen-dns-imports.sh` で作る。

import {
  for_each = local.pages_projects
  to       = cloudflare_pages_project.this[each.key]
  id       = "${var.cloudflare_account_id}/${each.key}"
}

import {
  for_each = local.pages_domains
  to       = cloudflare_pages_domain.this[each.key]
  id       = "${var.cloudflare_account_id}/${each.value}/${each.key}"
}

import {
  to = cloudflare_workers_kv_namespace.fle_prefs
  id = "${var.cloudflare_account_id}/c3b3f308e34d4e16b236fe4b1cd0e1cc"
}
