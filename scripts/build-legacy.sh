#!/usr/bin/env bash
# 旧版の myact・myqth を、ホストのルートにすべて置いた形で出す(Functions のない Pages プロジェクト用)。
# ホスト名で振り分ける Functions(functions/_middleware.ts)を通さないので、Pages の無料枠(Functions の
# 1日10万リクエスト)を使わない。旧版は API を sotaapp2.sotalive.net に直接呼ぶので、Functions は要らない。
#   dist-myact: myact・mypilgrim・www.sotalive.net(プロジェクト sotalive-myact)
#   dist-myqth: myqth.sotalive.net(プロジェクト sotalive-myqth)
set -euo pipefail
cd "$(dirname "$0")/.."

shared=packages/shared/common

# $1: アプリ(myact・myqth)、$2 以降: 共通アセットのうち使うもの
build() {
  local app=$1 out=dist-$1
  shift
  rm -rf "$out"
  mkdir -p "$out"
  for dir in "$@"; do
    cp -r "$shared/$dir" "$out/"
  done
  # ファビコンは共通アセットの favicon/ にある。ルートに置く(Vercel 版でもルートへのシンボリックリンクだった)
  cp "$shared"/favicon/* "$out/"
  cp apps/"$app"-org/index.html apps/"$app"-org/*.webmanifest.json "$out/"
  # ないパスは 404(404.html がないと、Pages はどのパスにも index.html を返す)。Vercel 版と同じ 404 のページ
  cp packages/shared/404.html "$out/"
}

build myact css js img font svg json
build myqth css js img font svg

# www.sotalive.net の /logconv 以下は、旧版の logconv(logconv.sotalive.net。新しい logconv のテストが済むまで Vercel)へ
cat > dist-myact/_redirects <<'REDIRECTS'
/logconv https://logconv.sotalive.net/ 302
/logconv/* https://logconv.sotalive.net/:splat 302
REDIRECTS
