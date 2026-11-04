locals {
  # Pages プロジェクト(デプロイは GitHub Actions の `wrangler pages deploy`。ここで持つのは、プロジェクトの存在だけ)
  # ビルド設定・環境変数・バインディングは、wrangler.toml とダッシュボードにあり、ここでは持たない
  pages_projects = toset([
    "sotalive",
    "sotalive-myact",
    "sotalive-myact2",
    "sotalive-myqth",
    "sotalive-logconv",
    "sotalive-fle",
  ])

  # カスタムドメイン → Pages プロジェクト。サブドメインは sotalive.net の下
  pages_domains = {
    "fleonline.sotalive.net" = "sotalive-fle"
    "logconv.sotalive.net"   = "sotalive-logconv"
    "myact2.sotalive.net"    = "sotalive-myact2"
    "myact.sotalive.net"     = "sotalive-myact"
    "mypilgrim.sotalive.net" = "sotalive-myact"
    "www.sotalive.net"       = "sotalive-myact"
    "myqth.sotalive.net"     = "sotalive-myqth"
  }
}
