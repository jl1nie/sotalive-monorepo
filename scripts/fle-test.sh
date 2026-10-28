#!/usr/bin/env bash
# FLE Online(apps/fle)の Vitest を、変わった箇所に応じて走らせる(docs/ci-cd.md の「fle のテストの範囲」)。
#
#   scripts/fle-test.sh          全部(基準がない。main・develop への push = デプロイの前)
#   scripts/fle-test.sh <rev>    <rev> から変わったファイル(まだコミットしていない分も含む)に関係するテストだけ
#
# <rev> を渡したときの範囲:
#   全部     wasm の元(crates/・Cargo.*)、apps/fle の設定(package.json・vite.config.ts・tsconfig*・eslint)、
#            lock ファイル・ワークスペース、CI(.github/)、scripts/ が変わった。
#            wasm は生成物(git に入れない)なので、変わったファイルから、どのテストが関係するかをたどれない
#   関係分   apps/fle/src が変わった。変わったファイルを読み込むテストだけ(vitest run --changed <rev>。
#            Vitest が import をたどる)
#   なし     それ以外(pages/fle・説明書・docs だけなど)。関係するテストがない
#
# 最初の行に、どの範囲で走らせたかを書く(CI のログで読む)。
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/apps/fle"

base="${1:-}"
if [ -z "$base" ]; then
  echo "fle-test: 全部(基準なし)"
  exec pnpm exec vitest run
fi

changed="$(git -C "$root" diff --name-only "$base"; git -C "$root" ls-files --others --exclude-standard)"
everything='^(crates/|Cargo\.(toml|lock)$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|package\.json$|\.github/|scripts/|apps/fle/(package\.json|vite\.config\.ts|tsconfig[^/]*\.json|eslint\.config\.js)$)'

if hit="$(grep -E -m 1 "$everything" <<<"$changed")"; then
  echo "fle-test: 全部($hit が変わった)"
  exec pnpm exec vitest run
fi
if ! grep -q '^apps/fle/src/' <<<"$changed"; then
  echo "fle-test: なし(apps/fle/src が変わっていない)"
  exit 0
fi
echo "fle-test: 関係分($base から変わったファイルを読み込むテスト)"
exec pnpm exec vitest run --changed "$base" --passWithNoTests
