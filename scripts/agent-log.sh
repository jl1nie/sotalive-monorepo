#!/usr/bin/env bash
# 終わった作業 1 件の行を docs/agent-log.md に足す: 作業がどう進んだか。トークンの数は、セッションの記録から
# 測る(docs/agent-workflow.md 7 章)。`scripts/ci-wait.sh` が CI PASS と言ったあとに、作業が終わったときに走らせる。
#
#   scripts/agent-log.sh <作業> <feature|fix|data|docs|infra> [--base REV] [--session FILE]
#                        [--gate-first yes|no] [--review "found X" | none | n/a]
#                        [--fixes-after-push N] [--corrections N] [--note TEXT]
#   scripts/agent-log.sh --summary [SINCE]    SINCE(日付 2026-10-01 か rev)以降の行を、種類ごとに集計する
#
# 測るもの(聞かない): 日付、--base 以降のコミット数(作業の最初のコミットの前の rev を渡す。既定は HEAD~1)、
# セッションの記録とそのサブエージェントから、モデルごとのトークン。測れないものはフラグで渡し、省くと `?`
# (最初のゲートで通ったか、レビューの結果、push 後の修正、利用者の訂正)。推測はしない。
# トークン: モデルごとに、input + cache 作成 + output(cache 読みは別の欄)。1 つのメッセージは記録に
# 何度も出る(内容のブロックごとに 1 行)ので、1 回だけ数える。
# --session の既定は、このプロジェクトの最新の記録。サブエージェントは、その隣の subagents/ を含める。
# **セッションの全体を数える**: 1 つのセッションで複数の作業をしたときは、あとの行に、それまでの全部が入る。
# 別々のセッションの行を比べるか、同じセッションの行の差を読む。2 つのリポジトリにまたがる作業は、
# セッションを始めたリポジトリの記録に書き、もう一方の PR はメモに書く。
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
LOG=docs/agent-log.md
PROJ="$HOME/.claude/projects/$(pwd | sed 's#/#-#g')"

if [ "${1:-}" = "--summary" ]; then
  python3 -I - "$LOG" "${2:-}" <<'PY'
import sys, re, subprocess, collections
log, since = sys.argv[1], sys.argv[2]
cut = ""
if since:
    # 日付(2026-10-01)はそのまま、そうでなければ rev の日付
    cut = since if re.match(r"\d{4}-\d\d-\d\d$", since) else subprocess.run(["git","log","-1","--format=%cs",since],capture_output=True,text=True).stdout.strip()
rows = []
for l in open(log):
    c = [x.strip() for x in l.strip().strip("|").split("|")]
    if len(c) >= 11 and re.match(r"\d{4}-\d\d-\d\d", c[0]) and c[0] >= cut:
        rows.append(c)
by = collections.defaultdict(list)
for r in rows: by[r[2]].append(r)
print(f"agent log: {cut or '最初'} 以降の行 {len(rows)} 件")
for m, rs in sorted(by.items()):
    g = [r[6] for r in rs]
    print(f"  {m}: {len(rs)} 件; 最初のゲートで通った yes={g.count('yes')} no={g.count('no')} ?={g.count('?')}; "
          f"レビューが欠陥を見つけた {sum(1 for r in rs if r[7] not in ('none','n/a','?'))} 件; "
          f"push 後の修正あり {sum(1 for r in rs if r[8] not in ('0','?'))} 件; 訂正あり {sum(1 for r in rs if r[9] not in ('0','?'))} 件")
PY
  exit 0
fi

LABEL="${1:-}"; MODE="${2:-}"
[ -n "$LABEL" ] && [ -n "$MODE" ] || { sed -n '2,/^set -uo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 2; }
shift 2
case "$MODE" in feature|fix|data|docs|infra) ;; *) echo "agent-log.sh: 種類は feature, fix, data, docs, infra のどれか" >&2; exit 2 ;; esac
BASE=HEAD~1; SESSION=""; GATE='?'; REVIEW='?'; FIXES='?'; CORR='?'; NOTE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --session) SESSION="$2"; shift 2 ;;
    --gate-first) GATE="$2"; shift 2 ;;
    --review) REVIEW="$2"; shift 2 ;;
    --fixes-after-push) FIXES="$2"; shift 2 ;;
    --corrections) CORR="$2"; shift 2 ;;
    --note) NOTE="$2"; shift 2 ;;
    *) echo "agent-log.sh: 知らないオプション '$1'" >&2; exit 2 ;;
  esac
done
[ -n "$SESSION" ] || SESSION=$(ls -t "$PROJ"/*.jsonl 2>/dev/null | head -n1)
[ -f "$SESSION" ] || { echo "agent-log.sh: セッションの記録がない(--session FILE で渡す)" >&2; exit 1; }
COMMITS=$(git rev-list --count "$BASE"..HEAD 2>/dev/null || echo '?')

TOK=$(python3 -I - "$SESSION" <<'PY'
import sys, json, glob, os, collections
f = sys.argv[1]
files = [f] + glob.glob(os.path.splitext(f)[0] + "/subagents/*.jsonl")
best = {}
for p in files:
    for l in open(p, errors="replace"):
        try: d = json.loads(l)
        except ValueError: continue
        m = d.get("message")
        if d.get("type") != "assistant" or not isinstance(m, dict) or not m.get("usage"): continue
        u = m["usage"]
        k = m.get("id") or d.get("uuid")
        v = (m.get("model", "?"), u.get("input_tokens", 0), u.get("cache_creation_input_tokens", 0),
             u.get("output_tokens", 0), u.get("cache_read_input_tokens", 0))
        if k not in best or v[3] >= best[k][3]: best[k] = v
t = collections.defaultdict(lambda: [0, 0])
for model, i, cc, o, cr in best.values():
    t[model][0] += i + cc + o; t[model][1] += cr
print("; ".join(f"{m}: {a/1e3:.0f}k (+{c/1e6:.1f}M cached)" for m, (a, c) in sorted(t.items()) if m != "<synthetic>"))
PY
)
mkdir -p "$(dirname "$LOG")"
if [ ! -f "$LOG" ]; then
  cat > "$LOG" <<'HDR'
# エージェントの記録

終わった作業 1 件につき 1 行。`scripts/agent-log.sh` が書く(`docs/agent-workflow.md` 7 章)。トークンは、セッションの記録と
サブエージェントから測る: モデルごとに input + cache 作成 + output(cache 読みは括弧の中)。`?` は記録していない
という意味で、推測した値ではない。セッションの全体を数えるので、1 つのセッションで複数の作業をしたときは、あとの行に
それまでの全部が入る。別々のセッションの行を比べるか、同じセッションの行の差を読む。
**月の最初の作業日(または記録が 10 行たまったとき)に** `scripts/agent-log.sh --summary <前回の日付>` を見て、
プロセスの変更を最大 1 つ提案し、次の月に比べる。

| 日付 | 作業 | 種類 | コミット数 | モデルごとのトークン | セッション | 最初のゲートで通った | レビューが見つけたこと | push 後の修正 | 利用者の訂正 | メモ |
|---|---|---|---|---|---|---|---|---|---|---|
HDR
fi
printf '| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n' "$(date +%F)" "$LABEL" "$MODE" "$COMMITS" "$TOK" \
  "$(basename "$SESSION" .jsonl | cut -c1-8)" "$GATE" "$REVIEW" "$FIXES" "$CORR" "${NOTE:-}" >> "$LOG"
tail -n 1 "$LOG"
