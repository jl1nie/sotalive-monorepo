#!/usr/bin/env bash
# 「通ったか」を、読み違えようのない 1 行で答える(docs/agent-workflow.md 8.1)。
#
#   scripts/verify.sh                全部の段階を走らせ、最初の失敗で止まる
#   scripts/verify.sh --keep-going   失敗しても全部の段階を走らせる
#   scripts/verify.sh --quick        clean と build を飛ばす(手元で直しているあいだ)
#   scripts/verify.sh --all          tools/jaffpota を変えていなくても parks を走らせる
#
# 段階(CI の .github/workflows/ci.yml と同じコマンド):
#   lint      pnpm run lint:apps
#   rust      cargo test --workspace
#   wasm      FLE の wasm のビルド(apps/fle/src/wasm/fle は git に入れない生成物。次の fle の前提)
#   fle・logconv・myact   各アプリで tsc -b・vitest run・eslint
#   geo       packages/geo(逆ジオコーダーなど)で tsc --noEmit・vitest run・eslint
#   shared    packages/shared の node --test(旧版が共有するコード。旧版の index.html の構文の検査を含む)
#   legacy    旧版(myqth・myact)をブラウザーで開く最低限のテスト(Playwright。CDN に届かない手元では LEGACY_CDN_DIR)
#   parks     tools/jaffpota の unittest(tools/jaffpota を変えたときだけ。変えていなければ、そう言って飛ばす)
#   clean     コミットした HEAD を、きれいなチェックアウト(git worktree。未追跡・無視のファイルなし)で、
#             pnpm install --frozen-lockfile → wasm → apps/fle の tsc・vitest・eslint。CI が見るもの。
#             **先にコミットする**(HEAD を試すので、作業ツリーの変更は見ない)。
#   build     pnpm run build(Pages に出すものまで。assemble.sh を含む)
#
# 最後の行は `VERIFY PASS` か `VERIFY FAIL: <段階>[, <段階>]`、終了コードは PASS のときだけ 0。
# 結果はこの行だけで読む。ラッパーなしで直接走らせる(`run_in_background` に `; echo` を足さない):
# ラッパーの終了コードはラッパーのもので、スクリプトの失敗を隠す。段階ごとのログは $VERIFY_DIR
# (既定 .verify)に残り、失敗した段階の最後の行を出す。
#
# `clean` がある理由: 手元のディスクにだけあるもの(git に入れない wasm、未追跡のファイル)に頼って通っても、
# CI では通らない。FLE の vitest は wasm がないと通らない。
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

KEEP_GOING=0
QUICK=0
ALL=0
for arg in "$@"; do
  case "$arg" in
    --keep-going) KEEP_GOING=1 ;;
    --quick) QUICK=1 ;;
    --all) ALL=1 ;;
    -h | --help)
      sed -n '2,/^set -uo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "verify.sh: 知らないオプション '$arg'" >&2
      exit 2
      ;;
  esac
done

VERIFY_DIR="${VERIFY_DIR:-.verify}"
mkdir -p "$VERIFY_DIR"
failed=()
n=0

strip_ansi() { sed 's/\x1b\[[0-9;]*m//g'; }

# stage <名前> <コマンド...>: 出力をログに取り、1 行で結果を出す。
stage() {
  local name="$1"
  shift
  n=$((n + 1))
  local log="$VERIFY_DIR/$(printf '%02d' "$n")-$name.log"
  local start=$SECONDS
  "$@" >"$log" 2>&1
  local status=$?
  local took=$((SECONDS - start))
  # cargo test は、バイナリごとに `test result:` を出す(足す)。vitest は `Tests  N passed` を出す。
  local counts
  counts=$(strip_ansi <"$log" | awk '/^test result:/ {p += $4; f += $6; b++} END {if (b) printf "%d passed, %d failed, %d binaries", p, f, b}')
  if [ -z "$counts" ]; then
    counts=$(strip_ansi <"$log" | grep -E '^ *Tests +[0-9]' | tail -n 1 | sed -E 's/^ +//; s/ +/ /g')
  fi
  local failed_tests=0
  if [ -n "$counts" ] && echo "$counts" | grep -qE '[1-9][0-9]* failed'; then
    failed_tests=1
  fi
  if [ "$status" -eq 0 ] && [ "$failed_tests" -eq 0 ]; then
    echo "PASS  $name (${took}s)${counts:+ — $counts}"
    return 0
  fi
  echo "FAIL  $name (${took}s, exit $status)${counts:+ — $counts}   log: $log"
  echo "  ---- $log の最後 ----"
  tail -n 15 "$log" | strip_ansi | sed 's/^/  | /'
  failed+=("$name")
  return 1
}

# --keep-going でなければ、最初の失敗で止まる。
run() {
  stage "$@" || { [ "$KEEP_GOING" = 1 ] || finish; }
}

finish() {
  if [ "${#failed[@]}" -eq 0 ]; then
    echo "VERIFY PASS"
    exit 0
  fi
  local IFS=,
  echo "VERIFY FAIL: ${failed[*]}" | sed 's/,/, /g'
  exit 1
}

app_checks() {
  (cd "apps/$1" && pnpm exec tsc -b && pnpm exec vitest run --passWithNoTests && pnpm exec eslint .)
}

# tools/jaffpota を変えたか(origin/main との差と、作業ツリーの変更)
jaffpota_changed() {
  { git diff --name-only origin/main...HEAD 2>/dev/null; git status --porcelain | sed 's/^...//'; } | grep -q '^tools/jaffpota/'
}

# コミットした HEAD の、きれいなチェックアウトで、FLE の確認をする。cargo の target は共有する
# (外部のクレートは作り直さない。wasm は作り直す)。pnpm のストアも共有される。
clean_checkout() {
  local root dir
  root="$(pwd)"
  dir="$(mktemp -d "${TMPDIR:-/tmp}/sotalive-verify-clean.XXXXXX")" || return 1
  git worktree add --detach "$dir" HEAD >/dev/null || return 1
  (
    cd "$dir" &&
      pnpm install --frozen-lockfile &&
      (cd apps/fle && CARGO_TARGET_DIR="$root/target" pnpm run wasm) &&
      (cd apps/fle && pnpm exec tsc -b && pnpm exec vitest run && pnpm exec eslint .)
  )
  local status=$?
  git worktree remove --force "$dir" >/dev/null 2>&1
  rm -rf "$dir"
  return $status
}

run lint pnpm run lint:apps
run rust cargo test --workspace
run wasm pnpm --filter @sotalive/fle wasm
run fle app_checks fle
run logconv app_checks logconv
run myact app_checks myact
run geo bash -c 'cd packages/geo && pnpm exec tsc --noEmit && pnpm exec vitest run && pnpm exec eslint .'
run shared node --test packages/shared/tests/*.test.mjs
run legacy node --test packages/shared/tests/legacy.e2e.mjs
if [ "$ALL" = 1 ] || jaffpota_changed; then
  run parks bash -c 'cd tools/jaffpota && uv run --frozen python -m unittest discover -s tests -t . -v'
else
  echo "SKIP  parks (tools/jaffpota を変えていない。--all で走らせる)"
fi
if [ "$QUICK" = 0 ]; then
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "NOTE  clean: 作業ツリーにコミットしていない変更がある。この段階は HEAD だけを試す"
  fi
  run clean clean_checkout
  run build pnpm run build
else
  echo "SKIP  clean, build (--quick。CI が見るきれいなチェックアウトは試していない)"
fi
finish
