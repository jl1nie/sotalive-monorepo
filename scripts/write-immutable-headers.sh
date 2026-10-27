#!/usr/bin/env bash
# 公園区域の TopoJSON(json/jaffpota-annotated-vN.json)を、長期キャッシュにする `_headers` を書く。
#   scripts/write-immutable-headers.sh <出力のディレクトリ>
# 版(vN)がファイル名に入っていて、新しい版は新しいファイルになる(tools/jaffpota の bump)ので、中身は変わらない。
# 14MB(gzip で 5.5MB)を、毎回再検証(max-age=0)せずに済む。ほかのファイルには付けない。
set -euo pipefail
out=${1:?出力のディレクトリ}
: > "$out/_headers"
for f in "$out"/json/jaffpota-annotated-v*.json; do
  [ -e "$f" ] || continue
  name=$(basename "$f")
  printf '/json/%s\n  Cache-Control: public, max-age=31536000, immutable\n\n' "$name" >> "$out/_headers"
done
