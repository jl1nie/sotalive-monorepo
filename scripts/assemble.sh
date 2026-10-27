#!/usr/bin/env bash
# 各アプリのビルドの出力(apps/*/dist)から、Pages のプロジェクトごとのデプロイの出力を組み立てる。
# 先に各アプリをビルドしておく(pnpm run build:apps。CI では、ジョブごとに別々に)。
#   dist: プロジェクト sotalive(まだ公開していない logconv2・myact2・myqth2。functions/_middleware.ts がホスト名で振り分ける)
#   dist-myact・dist-myqth・dist-fle: scripts/build-static-projects.sh
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist/logconv dist/myact2 dist/myqth2 dist/shared dist/functions
cp -r apps/logconv/dist/* dist/logconv/
cp -r apps/myact/dist/* dist/myact2/
cp -r apps/myqth/dist/* dist/myqth2/
# 共通アセット(myact2 の React 版も /json/ などを使う)
cp -r packages/shared/* dist/shared/
cp -r functions/* dist/functions/

# dist の直下に index.html か 404.html があると、Pages は、ないパスに 200 でそれを返す(SPA モード)。
# functions/_middleware.ts の「アプリにないファイルは共通アセットへ(404 を見て)」が、黙って効かなくなる
if [ -e dist/index.html ] || [ -e dist/404.html ]; then
  echo "dist の直下に index.html か 404.html がある(functions/_middleware.ts の 404 のフォールバックが効かなくなる)" >&2
  exit 1
fi

scripts/build-static-projects.sh
