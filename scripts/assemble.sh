#!/usr/bin/env bash
# 各アプリのビルドの出力(apps/*/dist)から、Pages のプロジェクトごとのデプロイの出力を組み立てる。
# 先に各アプリをビルドしておく(pnpm run build:apps。CI では、ジョブごとに別々に)。
#   dist: プロジェクト sotalive(まだ公開していない myact2・myqth2。functions/_middleware.ts がホスト名で振り分ける)
#   dist-myact・dist-myqth・dist-logconv・dist-fle: scripts/build-static-projects.sh
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist/myact2 dist/myqth2 dist/shared dist/functions
# myact2 は、次期 MyACT(apps/myact-next)。React 版(apps/myact)は凍結で、出さない
cp -r apps/myact-next/dist/* dist/myact2/
cp -r apps/myqth/dist/* dist/myqth2/
# 共通アセット(myact2 も /json/ などを使う)
cp -r packages/shared/* dist/shared/
cp -r functions/* dist/functions/

# dist の直下に index.html か 404.html があると、Pages は、ないパスに 200 でそれを返す(SPA モード)。
# functions/_middleware.ts の「アプリにないファイルは共通アセットへ(404 を見て)」が、黙って効かなくなる
if [ -e dist/index.html ] || [ -e dist/404.html ]; then
  echo "dist の直下に index.html か 404.html がある(functions/_middleware.ts の 404 のフォールバックが効かなくなる)" >&2
  exit 1
fi

scripts/build-static-projects.sh
