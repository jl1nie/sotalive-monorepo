#!/usr/bin/env bash
# コミットの CI を待ち、最後の 1 行で、通ったかを答える(docs/agent-workflow.md 8.1)。
#
#   scripts/ci-wait.sh                          HEAD のコミット
#   scripts/ci-wait.sh <sha>                    別のコミット
#   scripts/ci-wait.sh --need 'fle|rust'        名前が合うジョブが「成功」していることも求める
#                                               (そのジョブがなければ、通ったことにせず失敗にする)
#   scripts/ci-wait.sh --timeout 1800           この秒数で諦める(既定 3600)
#
# push した直後にバックグラウンドで走らせ、CI に左右されない仕事を先に進める。
# 最後の行は `CI PASS <sha8>` か `CI FAIL: <理由>`(失敗したジョブ、出てこない実行、`--need` のジョブがない・
# 成功していない、時間切れ)で、終了コードは PASS のときだけ 0。
#
# 知らないこと: `changes` ジョブのパスの絞り込みで、実行されるジョブは変わる。`skipped` は問題なしとして数える。
# 手動実行(workflow_dispatch。Deploy など)は、CI ではないので数えない(失敗した Deploy が残っていても、CI の結果は変わらない)。
# `--need` に合うジョブのうち、`skipped` は数えない(合うジョブが全部 skipped なら失敗)。
# `--need` は、その変更に効くジョブ(FLE なら `fle`・`rust`、本番に出たかなら `deploy-fle`)を、呼ぶ側が指定する方法。
# 例: 本番に出たかを見るには、マージの後で `scripts/ci-wait.sh <main の sha> --need 'deploy-fle'`
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

SHA=""
NEED=""
TIMEOUT=3600
while [ $# -gt 0 ]; do
  case "$1" in
    --need) NEED="${2:-}"; shift 2 ;;
    --timeout) TIMEOUT="${2:-3600}"; shift 2 ;;
    -h | --help)
      sed -n '2,/^set -uo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "ci-wait.sh: 知らないオプション '$1'" >&2
      exit 2
      ;;
    *) SHA="$1"; shift ;;
  esac
done
SHA="$(git rev-parse "${SHA:-HEAD}")" || { echo "CI FAIL: そのコミットはない"; exit 2; }
short="${SHA:0:8}"
start=$SECONDS

# `gh run list --commit` は、そのコミットの実行を返す。出てくるまで 90 秒待つ。
runs_json() { gh run list --commit "$SHA" --limit 30 --json databaseId,name,status,conclusion,event 2>/dev/null | jq -c '[.[] | select(.event != "workflow_dispatch")]'; }

appear_deadline=$((SECONDS + 90))
while :; do
  json="$(runs_json)"
  count="$(jq 'length' <<<"${json:-[]}" 2>/dev/null || echo 0)"
  [ "${count:-0}" -gt 0 ] && break
  if [ "$SECONDS" -ge "$appear_deadline" ]; then
    echo "CI FAIL: $short の実行が 90 秒たっても出てこない(パスの絞り込みか、push していない?)"
    exit 1
  fi
  sleep 10
done

while :; do
  json="$(runs_json)"
  pending="$(jq '[.[] | select(.status != "completed")] | length' <<<"$json")"
  [ "$pending" -eq 0 ] && break
  if [ $((SECONDS - start)) -ge "$TIMEOUT" ]; then
    echo "CI FAIL: ${TIMEOUT} 秒で時間切れ($short の実行が $pending 件、まだ終わっていない)"
    exit 1
  fi
  sleep 20
done

problems=()
while IFS=$'\t' read -r id name conclusion; do
  echo "run  $conclusion  $name"
  case "$conclusion" in
    success | skipped | neutral) ;;
    *) problems+=("実行 '$name' $conclusion") ;;
  esac
done < <(jq -r '.[] | [.databaseId, .name, .conclusion] | @tsv' <<<"$json")

# ジョブ: 成功でないものを出し、--need を確かめる。
alljobs=""
for id in $(jq -r '.[].databaseId' <<<"$json"); do
  jobs="$(gh run view "$id" --json jobs --jq '.jobs[] | [.conclusion, .name] | @tsv' 2>/dev/null)"
  alljobs+="$jobs"$'\n'
done
while IFS=$'\t' read -r conclusion name; do
  [ -z "${name:-}" ] && continue
  case "$conclusion" in
    success | skipped | neutral) ;;
    *) echo "job  $conclusion  $name"; problems+=("ジョブ '$name' $conclusion") ;;
  esac
done <<<"$alljobs"

if [ -n "$NEED" ]; then
  matching="$(grep -E "$NEED" <<<"$alljobs" | grep -vE '^skipped'"$(printf '\t')" || true)"
  if [ -z "$matching" ]; then
    problems+=("/$NEED/ に合うジョブが実行されていない")
  else
    ok="$(grep -cE "^success"$'\t' <<<"$matching" || true)"
    total="$(grep -c . <<<"$matching" || true)"
    echo "need /$NEED/: $total 件のうち $ok 件が成功"
    if [ "$ok" != "$total" ]; then
      problems+=("/$NEED/: $total 件のうち $ok 件が成功")
    fi
  fi
fi

if [ "${#problems[@]}" -eq 0 ]; then
  echo "記録: scripts/agent-log.sh <作業> <feature|fix|data|docs|infra> --base <作業の最初のコミットの前の rev>"
  echo "CI PASS $short"
  exit 0
fi
IFS=';'
echo "CI FAIL: ${problems[*]}"
exit 1
