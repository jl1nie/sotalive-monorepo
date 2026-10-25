# 山頂の POTA 判定のバッチ(推定・地図・目視の移行)

sotaapp2 の管理画面(山頂ごとの POTA 判定の見直し。`../sotaapp2/docs/summit-map-admin-design.md`)に入れるデータを、手元で作る道具と手順です。
空間計算(山頂のゾーン × 市区町村 × 公園区域)は重いので、手元のバッチで行い、結果だけをサーバーに入れます。道具は `tools/jaffpota`(Python、`uv`)にあります。

## 全体像

| 段階 | 道具 | 出力 | 場所 |
|---|---|---|---|
| ① 山頂ごとのゾーンと、市区町村との交わり | `batch_zones.py` | `zones.geojson`・`summit_muni.csv` | 手元の `explore/`(repo の外) |
| ② 候補の公園と、近さの診断 | `review_data.py`・`triage.py`・`heur.py` | `data.json`・`triage.json`・`heur.json` | 同上 |
| ③ 組の分類(答え・理由) | `review2_data.py` | `data2.json` | 同上(規則は `jaffpota/summit_pairs.py` に移し、テストで同値を確かめてある) |
| ④ **推定の CSV・下地の地図・目視の答え** | `python -m jaffpota.summit_export` | `summit_pota.csv`・`summit_maps.jsonl`・`verdicts.json` | この repo |
| ⑤ sotaapp2 に入れる | 管理画面か `curl` | — | — |
| ⑥ 目視を移す(1 回だけ) | `python -m jaffpota.migrate_verdicts` | — | この repo |
| ⑦ 配信が旧と同じかを確かめる | `python -m jaffpota.verify_served` | — | この repo |

①〜③ は `explore/` のまま使います(この repo にはまだ移していません)。④〜⑦ がこの repo の道具です。

## 入力(repo に置かないもの)

| 入力 | 中身 |
|---|---|
| N03 の Shape | 国土数値情報「行政区域」。`N03-20250101.shp`(同名の `.dbf`・`.shx`・`.prj` が隣に要る)。旧バッチの地図と図形が完全に一致する版。https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2025/N03-20250101_GML.zip |
| 公園区域 | `tools/jaffpota/out/v24/jaffpota-annotated-v24-full.json`(簡略化しない版) |
| `munitable.csv` | 市区町村のコードと JCC/JCG の表 |
| ①〜③ の出力 | `zones_all2/`・`data2.json` ほか |
| `city_j_fixes.csv` | city_j の誤りで除く市区町村 |
| sotaapp2 の DB の写し | 山頂の位置・名前、公園の名前 |
| 目視の正本 | 判定表の保存(`db_dump/verdicts2`)、見直しの確定(`db_dump5/verdicts`)、`manual_fixes.csv` |

N03・A10 などの再配布できないデータは、repo に置かずパスで渡します。

## ④ 書き出す

```bash
cd tools/jaffpota
B=~/sotaapp2-backups/sota_pota_20261024
uv run python -m jaffpota.summit_export \
  --parks out/v24/jaffpota-annotated-v24-full.json --munitable $B/jccjcg/munitable.csv \
  --n03 /path/to/N03-20250101.shp --zones $B/zones_all2 --data $B/data2.json \
  --city-j-fixes $B/city_j_fixes.csv --db /path/to/sotaapp2.db --out $B/sotaapp_out7 \
  --saved $B/db_dump/verdicts2 --rereview $B/db_dump5/verdicts --manual $B/manual_fixes.csv \
  --park-version jaffpota-annotated-v24-full --muni-version N03-20250101
```

約 7000 山頂で十数分かかります。版(`--park-version` など)を省くと、ファイル名とハッシュの先頭 8 桁になります。

### 出力

- **`summit_pota.csv`**: 山頂 × 市区町村 × 公園の組と、推定の答え(`all`/`part`/`none`)。**なしの組も出す。目視の答えは混ぜない。**
  - 組の列: `pct`・`px`・`tot_px`・`dist_m`・`noise`・`shallow`・`hint`(推定と別の側の答え)・`needs_review`・`note`(補正の規則が働いた理由)
  - 山頂の列(同じ山頂の行で同じ値): `input_rev`・`latitude`・`longitude`・`park_version`・`muni_version`・`munitable_version`・`reasons`・`change_note`
  - 推定の答えは、今までのバッチが配信していた答えから目視を除いたもの。判定表に保存がある山頂はデータの答え(`data_answer`)、ない山頂は規則の答え(`default`)。
- **`summit_maps.jsonl`**: 山頂ごとの簡易地図の**下地**(1 行 1 山頂)。`muni` の `pota` は推定の `all`/`part` だけ。`park` は候補のすべての組(目視で「一部」に変わっても描けるように)。`judge_park`(候補の公園の元の区域)は見直しの画面だけが使う。サーバーが答えを差し込んで配信用を作る。
- **`verdicts.json`**: 目視の答え。山頂ごとに、組すべての答え(なしも含む)。`source` が `human`(人が決めた)か `filled`(人が見ていない組を、今まで配信していた答えで埋めた。確定の API が組すべての答えを要求するため)。
- **`summary.json`**: 件数と版。

### `input_rev`(入力の指紋)

山頂の位置(小数 5 桁)、ゾーンの形、ゾーンにかかる市区町村の区域と候補の公園の区域(地図の窓で切ったもの)、候補の組のハッシュ(`r1-` + 16 桁)。窓の外の変更では変わらない。目視は、確定したときの `input_rev` を持ち、今の推定の `input_rev` と違えば要再確認になる。

## ⑤〜⑦ をまとめて実行する

```bash
tools/jaffpota/scripts/load_summit_data.sh --base-url https://sotaapp2.sotalive.net \
  --out ~/sotaapp2-backups/sota_pota_20261024/sotaapp_out7 --old ~/sotaapp2-backups/sota_pota_20261024/sotaapp_out6
```

- 本番では、接続先のホスト名の入力で確認します。そのあと、**Firebase のメールアドレスとパスワードを画面で尋ね**ます(パスワードは表示しません。環境変数は読みません)。端末から実行してください。
- 順に、推定の取り込み → 地図の取り込み → 目視の移行(`--dry-run` のあと本実行)→ 配信の検証を実行します。各ステップで、応答の件数を `summary.json` と照合し、合わなければそこで止まります。
- **配信の検証は、本番では標本**です(目視の山頂すべてと、無作為の 300 山頂を、2 並列で)。全山頂(約 1.4 万リクエスト)は、本番の小さなマシン(`shared-cpu-1x`、256 MB)に負荷がかかるので、手元のサーバーでだけ実行します。本番でも全山頂が要るときだけ `--full-verify` を付けます。
- 止まったら、直してから `--from pota|maps|migrate|verify` で続きから実行できます(各ステップは何度実行しても同じ結果になります)。
- 手元のサーバー(`localhost`・`127.0.0.1`。`ADMIN_DEV_EMAIL` 付きで起動)には、尋ねずに認証なしで実行します。
- 実行する前に、DB のバックアップを取ってください(sotaapp2 の Deploy は自動で取ります)。

以下は、スクリプトがしていることを、1 ステップずつ手で実行するときの手順です。

## ⑤ sotaapp2 に入れる

管理者の認証が要ります。**順番は「推定の CSV を先に、地図を後に」**(逆だと、地図の下地の版が古い入力のままになり、`map_mismatch` が出る)。

`$TOKEN` は、Firebase のサインインで返る id_token(`Authorization` ヘッダー)です。手元のサーバーを `ADMIN_DEV_EMAIL` 付きで起動したときは要りません(`-H` を外す)。

```bash
OUT=$B/sotaapp_out7
TOKEN=$(curl -si -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SOTAAPP_EMAIL\",\"password\":\"$SOTAAPP_PASSWORD\"}" "$BASE/api/v2/auth/signin" \
  | tr -d '\r' | awk -F': ' 'tolower($1)=="authorization"{print $2}')
# 推定。mode=full は、ファイルにない山頂の推定・meta を消す(目視・確定・履歴・地図は消さない)
curl -H "Authorization: Bearer $TOKEN" -F file=@$OUT/summit_pota.csv "$BASE/api/v2/sota/import/pota?mode=full"
# 地図は .gz で送る(管理者のアップロードは 8 MB まで。生の jsonl は約 38 MB)
gzip -k -c $OUT/summit_maps.jsonl > $OUT/summit_maps.jsonl.gz
curl -H "Authorization: Bearer $TOKEN" -F file=@$OUT/summit_maps.jsonl.gz "$BASE/api/v2/sota/import/maps"
```

## ⑥ 目視を移す(1 回だけ)

推定の組と目視の組が一致していないと、確定の API が 400 にします。⑤ のあとに実行します。

```bash
export SOTAAPP_EMAIL=... SOTAAPP_PASSWORD=...     # Firebase のサインイン(単独で実行するとき。スクリプトは画面で尋ねる)。表示もログもされない
uv run python -m jaffpota.migrate_verdicts $B/sotaapp_out7/verdicts.json --base-url "$BASE" --dry-run
uv run python -m jaffpota.migrate_verdicts $B/sotaapp_out7/verdicts.json --base-url "$BASE"
```

- 先に、すべての山頂の組が一致することを確かめ、1 つでも合わなければ何も書かずに止まります。
- 管理画面で人が確定した山頂(`note` が「判定表から移行」でない確定)は、上書きしません。問題として止まります。上書きしてよいときだけ `--overwrite-reviews` を付けます。
- `--only JA/AC-006 ...` で山頂を絞れます。値を渡さなければエラーです。
- 認証情報を送るので、接続先は `https://`(手元の `localhost`・`127.0.0.1` を除く)に限ります。
- 確定者は、サインインした人。日時は実行した時刻。`note` は「判定表から移行」。元の記録の日時・UID は残りません。
- すでに同じ答えで確定済みの山頂は飛ばすので、途中で止まっても、そのまま再実行できます。
- 手元のサーバーを `ADMIN_DEV_EMAIL` 付きで起動したときは、環境変数なしで(認証なしで)呼べます。

## ⑦ 確かめる

```bash
uv run python -m jaffpota.verify_served --old-csv $B/sotaapp_out6/summit_pota.csv \
  --old-maps $B/sotaapp_out6/summit_maps.jsonl.gz --verdicts $B/sotaapp_out7/verdicts.json --base-url "$BASE" \
  --sample 300 --workers 2     # 本番。手元のサーバーなら --sample を外して全山頂(--workers 8)
```

旧バッチの出力と、いま配信している答え(`/summits/{code}/pota`)・地図(`/summits/{code}/map`)を比べます。`--sample N` は、目視の山頂すべてと、残りから無作為に N 山頂です。差があれば、山頂ごとに表示して終了コード 1 で終わります。

サーバー不要の確認もあります。手元のバッチの出力が見える環境で、次を実行すると、推定と目視を合わせた答えが旧 `summit_pota.csv` と完全に一致すること(行数と、人が決めた組の `verified` を含む)と、組の分類が元の `review2_data.py` の出力と一致することを確かめます。

```bash
JAFFPOTA_SUMMIT_BACKUP=$B uv run python -m unittest tests.test_summit_pairs -v
```

### 既知の差: 人が見ていない組の `verified`

確定の API は、山頂の組すべての答えを要求します。そのため、目視の山頂のうち、人が見ていない組(`verdicts.json` の `source: filled`。3 組)も、今まで配信していた答えで埋めて確定します。サーバーは、目視の行がある組を `verified: true` として配信するので、旧(`verified=0`)と違って見えます。

- 配信の答え(all/part)は変わりません。見える差は、`JA/AC-006` の `JCC#2023|JP-0125`(all)の `verified` が 0 → 1 になる 1 組だけです(残り 2 組は none で、配信されません)。
- 手元の `served()` は、`filled` を `verified=0` と数えます。サーバーと数え方が違います。`verify_served --verdicts` は、サーバーの数え方(目視の行がある組が `verified`)で期待値を作ります。

## `input_rev` の範囲

`input_rev` は、図形と候補の組から作ります。`data2.json` の規則やしきい値(`FULL`・`NEAR` など)を変えて推定の答えだけが変わっても、図形と組が同じなら変わらず、確定は確定のままです。規則を変えたときに全山頂の見直しを求めたい場合は、`REV_PREFIX`(`jaffpota/summit_export.py`)の版を上げます(全山頂の `input_rev` が変わり、要再確認になります)。

## 規則の出どころ

- 組の分類・理由・`default`(`jaffpota/summit_pairs.py`): 元の `review2_data.py` と同じ。しきい値は `FULL=0.99`(全部)・`TINY=0.05`(なし)・`NEAR=50 m`・`SNAP=0.8`。
- 目視とみなす答え(`build_verdicts`): 判定表は、確認するとカードがせり上がり、見ていない山頂の確認ボタンを押させてしまう作りだった(2026-10-24)。そのため、**確かめたと分かっている山頂**(`CONFIRMED` の 7 山頂)と、**保存された答えが最初の答えと違う山頂**だけを目視とみなす。最初に選んでおいた答えのまま保存された山頂は、見たかどうか区別できないので、目視とみなさずデータの答えに戻す。
- 優先順位: `manual_fixes.csv` > 見直しの確定(rereview)> 判定表の保存。

## 今のところ出していないもの

- `peak`(山頂の最高点): 標高データが要る。画面は無くても描ける。
- `change_note`(前の入力との差分): 2 回目以降の取り込みで要る。
- 上流 ①〜③ の `explore/` からの移動。
