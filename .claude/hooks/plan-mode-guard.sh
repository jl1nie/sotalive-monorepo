#!/usr/bin/env bash
# ExitPlanMode の PreToolUse の hook(docs/agent-workflow.md 2a 章)。
# 計画は、先頭に種類(`Type:`)と、本番への影響(`本番:`)を書き、種類ごとの証拠を添える:
#   Type: feature  新しい公開の入口ごとに「間違っていたら落ちるテスト」(`落ちる` か `fails if`)
#   Type: fix      直す前に落ちるテスト、または再現の手順(`落ちる` か `再現`)
#   Type: data     DB・件数・本番への取り込み。バックアップ(`バックアップ`)
#   Type: docs / infra  証拠は要らない
# `本番:` の行は、`Type: docs` 以外で必須(影響がなければ「なし」と書く)。
# 計画の本文は tool_input.plan から読む。なければ、最新の ~/.claude/plans/*.md を読む。
# 逃げ道: 環境変数 PLAN_GUARD=off、または jq がないとき(閉じ込めない)。使ったら理由を計画に書く。
set -euo pipefail

[[ "${PLAN_GUARD:-}" == "off" ]] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
plan=$(jq -r '.tool_input.plan // ""' <<<"$input")
if [[ -z "$plan" ]]; then
  newest=$(ls -t "$HOME"/.claude/plans/*.md 2>/dev/null | head -n1 || true)
  [[ -n "$newest" ]] && plan=$(cat "$newest")
fi
if [[ -n "${PLAN_GUARD_DEBUG:-}" ]]; then
  printf '%s\n' "$input" >>"$PLAN_GUARD_DEBUG"
fi

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

type=$(grep -m1 -iE '^\**Type:' <<<"$plan" | sed -E 's/^\**[Tt]ype:\**[[:space:]]*//' | tr 'A-Z' 'a-z' | awk '{print $1}' || true)
if [[ -z "$type" ]]; then
  deny "docs/agent-workflow.md 2a 章: 計画に 'Type:' の行がない。先頭に 'Type: feature' / 'fix' / 'data' / 'docs' / 'infra' のどれかと、'本番:' の行を書き、その種類の証拠を添える。"
fi
case "$type" in
  feature | fix | data | docs | infra) ;;
  *) deny "docs/agent-workflow.md 2a 章: 'Type: $type' は知らない種類(feature / fix / data / docs / infra のどれか)。" ;;
esac
if [[ "$type" != "docs" ]] && ! grep -qE '^\**本番:' <<<"$plan"; then
  deny "docs/agent-workflow.md 2a 章: '本番:' の行がない(本番への影響。なければ「なし」と書く)。Type: docs 以外では必須。"
fi
if [[ "$type" == "feature" ]] && ! grep -qiE '落ちる|fails if' <<<"$plan"; then
  deny "docs/agent-workflow.md 2a 章: Type: feature は、新しい公開の入口ごとに、間違っていたら落ちるテスト('落ちる' か 'fails if')を書く。"
fi
if [[ "$type" == "fix" ]] && ! grep -qE '落ちる|再現|fails if' <<<"$plan"; then
  deny "docs/agent-workflow.md 2a 章: Type: fix は、直す前に落ちるテスト、または再現の手順('落ちる' か '再現')を書く。"
fi
if [[ "$type" == "data" ]] && ! grep -qE 'バックアップ|backup' <<<"$plan"; then
  deny "docs/agent-workflow.md 2a 章: Type: data は、バックアップ(と、標本での検証)を書く。"
fi
exit 0
