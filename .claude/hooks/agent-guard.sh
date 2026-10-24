#!/usr/bin/env bash
# Agent ツールの PreToolUse の hook(docs/agent-workflow.md 3 章)。
# 実装が気づかないうちに主のループのモデル(Opus)で走る、2 つの道を拒む:
# fork(主のモデルを引き継ぐ)と、runner への model の上書き。
# mfsk-core の .claude/hooks/agent-guard.sh と同じもの。
set -euo pipefail
input=$(cat)
type=$(jq -r '.tool_input.subagent_type // ""' <<<"$input")
model=$(jq -r '.tool_input.model // ""' <<<"$input")

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

if [[ "$type" == "fork" ]]; then
  deny "docs/agent-workflow.md 3 章: fork は使わない(主のモデルを引き継ぐ)。主のループで作業するか、/model で切り替えるか、runner を使う。"
fi
if [[ "$type" == "runner" && -n "$model" ]]; then
  deny "docs/agent-workflow.md 3 章: runner のモデルは .claude/agents/runner.md で決まっている。model の指定を外す。"
fi
exit 0
