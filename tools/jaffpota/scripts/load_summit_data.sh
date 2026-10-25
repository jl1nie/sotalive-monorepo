#!/usr/bin/env bash
# 山頂の POTA 判定のデータを sotaapp2 に入れる(推定の CSV → 地図 → 目視の移行 → 配信の検証)。
# 手順と背景は docs/summit-batch.md。
#
#   tools/jaffpota/scripts/load_summit_data.sh --base-url https://sotaapp2.sotalive.net \
#       --out ~/sotaapp2-backups/sota_pota_20261024/sotaapp_out7 \
#       --old ~/sotaapp2-backups/sota_pota_20261024/sotaapp_out6
#
# 認証: 実行時に、Firebase のメールアドレスとパスワードを画面で尋ねる(パスワードは表示しない。環境変数は読まない)。
#       手元のサーバー(localhost・127.0.0.1)は、尋ねずに認証なしで呼ぶ(ADMIN_DEV_EMAIL 付きで起動したとき)。
# 各ステップは、応答の件数を summary.json と照合し、合わなければそこで止まる。
# 途中で止まったら、直してから --from で続きから実行できる(各ステップは何度実行しても同じ結果になる)。
set -euo pipefail

STEPS=(pota maps migrate verify)
BASE=""
OUT=""
OLD=""
FROM="pota"
YES=0
FULL_VERIFY=0

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  cat <<'EOF'

オプション:
  --base-url URL   sotaapp2 の URL(必須)
  --out DIR        summit_export の出力(summit_pota.csv・summit_maps.jsonl・verdicts.json・summary.json)(必須)
  --old DIR        旧バッチの出力(summit_pota.csv・summit_maps.jsonl.gz)。verify に使う(verify を実行するなら必須)
  --from STEP      pota | maps | migrate | verify から始める(既定 pota)
  --yes            確認を省く(本番では使わない)
  --full-verify    本番でも、配信の検証を全山頂(約 1.4 万リクエスト)で実行する。本番の小さなマシンに負荷がかかるので、
                   ふつうは使わない(本番は、目視の山頂すべてと無作為の 300 山頂を、2 並列で確かめる)
EOF
}

die() { echo "エラー: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --base-url) BASE="${2:?--base-url に値が要ります}"; shift 2 ;;
    --out) OUT="${2:?--out に値が要ります}"; shift 2 ;;
    --old) OLD="${2:?--old に値が要ります}"; shift 2 ;;
    --from) FROM="${2:?--from に値が要ります}"; shift 2 ;;
    --yes) YES=1; shift ;;
    --full-verify) FULL_VERIFY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "知らないオプション: $1" ;;
  esac
done

[ -n "$BASE" ] || { usage >&2; die "--base-url が要ります"; }
[ -n "$OUT" ] || { usage >&2; die "--out が要ります"; }
BASE="${BASE%/}"
OUT="${OUT/#\~/$HOME}"
[ -z "$OLD" ] || OLD="${OLD/#\~/$HOME}"

start=-1
for i in "${!STEPS[@]}"; do [ "${STEPS[$i]}" = "$FROM" ] && start=$i; done
[ "$start" -ge 0 ] || die "--from は ${STEPS[*]} のどれか: $FROM"
run() { # そのステップを実行するか
  for i in "${!STEPS[@]}"; do
    if [ "${STEPS[$i]}" = "$1" ]; then [ "$i" -ge "$start" ]; return; fi
  done
}

for cmd in curl python3 uv gzip; do command -v "$cmd" >/dev/null || die "$cmd が見つかりません"; done
for f in summit_pota.csv summit_maps.jsonl verdicts.json summary.json; do
  [ -f "$OUT/$f" ] || die "$OUT/$f がありません"
done
if run verify; then
  [ -n "$OLD" ] || die "verify には --old が要ります"
  for f in summit_pota.csv summit_maps.jsonl.gz; do [ -f "$OLD/$f" ] || die "$OLD/$f がありません"; done
fi

# このスクリプトのある tools/jaffpota で uv を実行する
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 期待する件数
read -r EXP_PAIRS EXP_SUMMITS EXP_MAPS EXP_VERDICTS < <(python3 - "$OUT/summary.json" <<'PY'
import json, sys
s = json.load(open(sys.argv[1], encoding="utf-8"))
print(s["pairs"], s["summits"], s["maps"], s["verdict_summits"])
PY
)

HOST="$(python3 -c 'import sys,urllib.parse as u; print(u.urlsplit(sys.argv[1]).hostname or "")' "$BASE")"
LOCAL=0
case "$HOST" in localhost|127.0.0.1|::1) LOCAL=1 ;; esac
[ "$LOCAL" = 1 ] || case "$BASE" in https://*) ;; *) die "本番の接続先は https:// にしてください: $BASE" ;; esac

cat <<EOF
接続先:   $BASE
入力:     $OUT
期待する件数: 推定 ${EXP_PAIRS} 行 / ${EXP_SUMMITS} 山頂、地図 ${EXP_MAPS} 山頂、目視 ${EXP_VERDICTS} 山頂
実行するステップ: $(for s in "${STEPS[@]}"; do run "$s" && printf '%s ' "$s"; done)
EOF
if [ "$YES" != 1 ] && [ "$LOCAL" != 1 ]; then
  echo
  echo "これは本番のデータを書き換えます(推定を mode=full で置き換え、地図を入れ、目視を確定します)。"
  echo "DB のバックアップを取ったか確認してください。続けるなら、接続先のホスト名 ($HOST) を入力:"
  read -r answer
  [ "$answer" = "$HOST" ] || die "ホスト名が違うので中止しました"
fi

# 認証。メールとパスワードは画面で尋ねる。トークンは 0600 のヘッダーファイルに置き、コマンドラインにも出力にも出さない
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"
: > "$WORK/auth"
AUTH=()
# 環境にトークンやパスワードが残っていても使わない(画面で尋ねたものだけを使う)
unset SOTAAPP_BEARER SOTAAPP_EMAIL SOTAAPP_PASSWORD
if [ "$LOCAL" != 1 ]; then
  [ -t 0 ] || die "メールとパスワードを画面で尋ねるので、端末から実行してください"
  read -r -p "Firebase のメールアドレス: " SOTAAPP_EMAIL
  read -r -s -p "パスワード: " SOTAAPP_PASSWORD; echo
  [ -n "$SOTAAPP_EMAIL" ] && [ -n "$SOTAAPP_PASSWORD" ] || die "メールとパスワードが要ります"
  export SOTAAPP_EMAIL SOTAAPP_PASSWORD   # 移行・検証のコマンド(子プロセス)がサインインするため。このスクリプトの外には残らない
  python3 -c 'import json,os; print(json.dumps({"email": os.environ["SOTAAPP_EMAIL"], "password": os.environ["SOTAAPP_PASSWORD"]}))' \
    | curl -sS -i -X POST -H 'Content-Type: application/json' -H 'User-Agent: sotalive-jaffpota/1.0' --data-binary @- \
        "$BASE/api/v2/auth/signin" > "$WORK/signin"
  tok="$(tr -d '\r' < "$WORK/signin" | awk -F': ' 'tolower($1)=="authorization"{print $2}')"
  [ -n "$tok" ] || die "サインインできませんでした(メールかパスワードが違う)"
  printf 'Authorization: Bearer %s\n' "$tok" > "$WORK/auth"
  unset tok
  AUTH=(-H "@$WORK/auth")
fi
chmod 600 "$WORK/auth"

# 応答の JSON から、キーの値を取り出す(なければ空)
jget() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1], encoding="utf-8")); v=d.get(sys.argv[2]); print("" if v is None else v)' "$1" "$2"; }

upload() { # 名前 パス ファイル → 応答を $WORK/<名前>.json に保存
  local name="$1" path="$2" file="$3" code
  code="$(curl -sS -o "$WORK/$name.json" -w '%{http_code}' -H 'User-Agent: sotalive-jaffpota/1.0' "${AUTH[@]}" \
    -F "file=@$file" "$BASE$path")"
  if [ "$code" != 200 ]; then
    echo "HTTP $code: $(head -c 400 "$WORK/$name.json")" >&2
    die "$name のアップロードに失敗しました"
  fi
}

if run pota; then
  echo "== 1/4 推定の取り込み (mode=full)"
  upload pota "/api/v2/sota/import/pota?mode=full" "$OUT/summit_pota.csv"
  echo "   $(jget "$WORK/pota.json" message)"
  [ "$(jget "$WORK/pota.json" imported)" = "$EXP_PAIRS" ] || die "取り込んだ行数が違う(期待 $EXP_PAIRS, 実際 $(jget "$WORK/pota.json" imported))"
  [ "$(jget "$WORK/pota.json" summits)" = "$EXP_SUMMITS" ] || die "取り込んだ山頂の数が違う(期待 $EXP_SUMMITS, 実際 $(jget "$WORK/pota.json" summits))"
fi

if run maps; then
  echo "== 2/4 地図の取り込み"
  gzip -c "$OUT/summit_maps.jsonl" > "$WORK/summit_maps.jsonl.gz"
  size=$(wc -c < "$WORK/summit_maps.jsonl.gz")
  [ "$size" -le $((8 * 1024 * 1024)) ] || die "gzip した地図が 8 MB を超えています($size バイト。管理者のアップロード上限)"
  upload maps "/api/v2/sota/import/maps" "$WORK/summit_maps.jsonl.gz"
  echo "   imported=$(jget "$WORK/maps.json" imported)"
  [ "$(jget "$WORK/maps.json" imported)" = "$EXP_MAPS" ] || die "取り込んだ地図の数が違う(期待 $EXP_MAPS, 実際 $(jget "$WORK/maps.json" imported))"
fi

if run migrate; then
  echo "== 3/4 目視の移行"
  (cd "$HERE" && uv run python -m jaffpota.migrate_verdicts "$OUT/verdicts.json" --base-url "$BASE" --dry-run)
  (cd "$HERE" && uv run python -m jaffpota.migrate_verdicts "$OUT/verdicts.json" --base-url "$BASE")
fi

if run verify; then
  # 本番の小さなマシン(shared-cpu-1x)に負荷をかけないよう、標本と低い並列度にする。手元のサーバーは全山頂
  if [ "$LOCAL" = 1 ] || [ "$FULL_VERIFY" = 1 ]; then
    VERIFY_ARGS=(--workers 8)
    echo "== 4/4 配信の検証(全山頂)"
  else
    VERIFY_ARGS=(--sample 300 --workers 2)
    echo "== 4/4 配信の検証(目視の山頂すべてと無作為の 300 山頂。本番に負荷をかけないため)"
  fi
  (cd "$HERE" && uv run python -m jaffpota.verify_served --old-csv "$OLD/summit_pota.csv" \
    --old-maps "$OLD/summit_maps.jsonl.gz" --verdicts "$OUT/verdicts.json" --base-url "$BASE" "${VERIFY_ARGS[@]}")
fi

echo "完了"
