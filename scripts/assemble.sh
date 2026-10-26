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

scripts/build-static-projects.sh
