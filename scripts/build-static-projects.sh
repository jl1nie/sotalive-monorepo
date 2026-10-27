#!/usr/bin/env bash
# 公開しているアプリを、それぞれの Pages プロジェクトのルートに置いた形で出す。
# ホスト名で振り分ける Functions(functions/_middleware.ts。プロジェクト sotalive。まだ公開していない logconv2・myact2 だけ)
# を通さないので、静的なファイルは Pages の無料枠(Functions の 1日10万リクエスト)を使わない。
#   dist-myact: 旧版の myact(myact・mypilgrim・www.sotalive.net。プロジェクト sotalive-myact。Functions なし)
#   dist-myqth: myqth(myqth.sotalive.net。プロジェクト sotalive-myqth。Functions なし)。新版(apps/myqth。Vite + 素の TS)。旧版(apps/myqth-org)は、戻せるように残してある
#   dist-fle:   FLEonline(fleonline.sotalive.net。プロジェクト sotalive-fle。Functions は /api の下だけ: pages/fle)
# 旧版は API を sotaapp2.sotalive.net に直接呼ぶので、Functions は要らない。
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
# myqth: 新版のビルド(apps/myqth/dist)をそのまま置く。ファビコンと 404.html は、旧版と同じくルートに足す。
# 旧版に戻すときは、このブロックを `build myqth css js img font svg` に替える(apps/myqth-org は残してある)
rm -rf dist-myqth
mkdir -p dist-myqth
cp -r apps/myqth/dist/* dist-myqth/
cp "$shared"/favicon/* dist-myqth/
cp packages/shared/404.html dist-myqth/
test -f dist-myqth/index.html || { echo "dist-myqth/index.html がない(先に apps/myqth をビルドする)" >&2; exit 1; }

# www.sotalive.net の /logconv 以下は、旧版の logconv(logconv.sotalive.net。新しい logconv のテストが済むまで Vercel)へ
cat > dist-myact/_redirects <<'REDIRECTS'
/logconv https://logconv.sotalive.net/ 302
/logconv/* https://logconv.sotalive.net/:splat 302
REDIRECTS

# FLEonline: /fle/ の下(PWA の範囲。インストール済みのアプリと端末の保存データを、そのまま使う)。ルートは /fle/ へ
rm -rf dist-fle
mkdir -p dist-fle/fle
cp -r apps/fle/dist/* dist-fle/fle/
cat > dist-fle/_redirects <<'REDIRECTS'
/ /fle/ 302
REDIRECTS
