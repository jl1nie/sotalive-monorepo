# 公園区域データ(jaffpota-annotated-vN.json)

MyACT の地図に描く POTA/JAFF の公園区域は、TopoJSON の `packages/shared/common/json/jaffpota-annotated-vN.json` です。
この文書は、区域データの作成経緯、再生成の方法、版の更新、DB とのずれの直し方をまとめたものです。
道具は `tools/jaffpota`(Python。依存の版は `pyproject.toml` と `uv.lock` で固定)にあります。
山頂ごとの POTA 判定(FLEonline の地図と sotaapp2 の管理画面)に使うデータの作り方は [summit-batch.md](summit-batch.md) です。

AI に作業させるときは、この文書全体を渡し、次のように依頼してください。

> MyACT の公園区域データを、docs/park-areas.md の手順と規則で再生成(または次の版へ更新)してください。固定版の入力のハッシュを照合し、`--strict` で未割当・重複を確認してから生成し、仕様の件数と `jaffpota.compare` の結果を報告してください。固定版の入力を取得・照合できない場合は値を推測せず、何が不足したかを報告してください。

## 概要

| 項目 | 内容 |
|---|---|
| 形式 | TopoJSON の `jaffpota` という GeometryCollection 1 つ。各 geometry は Polygon か MultiPolygon で、文字列の `POTA`、`JAFF`、`NAME`、`PID`、`UID` を持つ |
| 読む側 | 旧版 MyACT(`apps/myact-org/index.html` の `updateGeoJson`。設定の「自然公園の領域を表示」(Cookie `display_area`、既定は表示)で切り替える)。React 版(`apps/myact`)はまだ v22 を読んでいる(下の「未完のこと」) |
| 版 | ファイル名の `-vN` が CDN・ブラウザーのキャッシュの無効化を兼ねる。更新は次の版のファイルを足して参照を差し替える。旧版はロールバック用に残す |
| 影響しないもの | POTA マーカーの位置・名称・ログ(外部 API から取る) |

区域の出どころは二つです。

| 区域 | 出どころ |
|---|---|
| 国立公園 35 件 | 環境省生物多様性センターの国立公園区域 Shape(2025-04-28 公開版)。JAFF/PID の区分は Shape にないので、v22 の区分から推定した |
| 国定・県立等 361 件(v23 では 360 件) | v22 の区域をそのまま使う。v22 の元データの年代は確かめられていない(国土数値情報「自然公園地域」の 2010 年版 A10-10 とみられる) |

## 道具

`tools/jaffpota` で実行します(初回は `uv sync`)。

| コマンド | 用途 |
|---|---|
| `uv run python -m jaffpota.generate specs/vN.json --out out/ [--strict] [--base 旧版.json] [--nps nps.zip]` | 旧版と環境省 Shape から新しい版を生成する。`out/` に JSON、`report.json`(診断)、`problems.geojson`(未割当・重複の形状)。`--base` を省くと共通アセットの旧版、`--nps` を省くと仕様の `path` を読む |
| `uv run python -m jaffpota.generate specs/v24.json --out out/v24 --a10 A10-10.geojson` | v24 以降。国定・県立等を国土数値情報 A10 の原形から作る(下の「v24: 国定・県立等を原形にする」) |
| `uv run python -m jaffpota.compare a.json b.json [--ignore-pota JP-xxxx]` | 二つの版を区域として比べる。geometry が対応すれば対称差の面積、しなければ POTA ごとの面積の差 |
| `uv run python -m jaffpota.release` | 最新版と、読む側の参照の版を表示する |
| `uv run python -m jaffpota.release bump new.json` | `new.json` を次の版として置き、参照を差し替えて検証を実行する |
| `uv run python -m jaffpota.patch [--dry-run] [--out new.json]` | POTA/JAFF/NAME を sotaapp2 の DB に合わせて対話式に直す |
| `uv run python -m unittest discover -s tests -t . -v` | 検証。CI(`parks` ジョブ)でも走る |

検証には、固定版から再生成して配備中の v23 と区域が同じかを見るもの(`tests/test_reproduce.py`。30〜45 秒)も入っています。DB 照合だけは、環境変数を渡したときに走ります。

```bash
JAFFPOTA_API=https://sotaapp2.sotalive.net uv run python -m unittest tests.test_release_data -v   # 全 POTA が DB にあり active か
```

版ごとの入力のハッシュ、新規の公園、差し引く区域、期待する件数は `specs/vN.json` に書きます。コードには版ごとの値を置きません。

## 入力

| 入力 | ありかと確認 |
|---|---|
| v22 の TopoJSON | `packages/shared/common/json/jaffpota-annotated-v22.json`。SHA-256 `205f560a3fac50874fa7b97d8a479988364bdb02b43c1bda571bbff3f0fa3134`。見つからなければ `https://myact.sotalive.net/json/jaffpota-annotated-v22.json` から取り、同じハッシュを確かめる |
| 環境省の国立公園 Shape ZIP(`nps.zip`) | `tools/jaffpota/inputs/nps-2025-04-28/nps.zip`(47 MB)。2025-04-28 公開版を 2026-10-17 にダウンロードしたもの。SHA-256 `2e8589185046e0dcca24dfafe0b6155f872d2909ed9e9cb451a4abee7ca4abc3`。中身は `nps.shp`・`.shx`・`.dbf`・`.prj`(と `nps_all.lyrx`)。属性は UTF-8。原典と利用条件は同じ場所の `SOURCE.md` |

配布元の `gis.biodic.go.jp` は 2026-10 時点で名前が引けず(NXDOMAIN)、Wayback Machine にもアンケート画面しか残っていません。再取得できないので、取得したままの ZIP を固定版としてリポジトリに置いています(利用条件は PDL1.0 で、出典を書けば再配布できます)。
公開 URL から取り直せた場合も、内容のハッシュが違えば別の版です。新しい版に合わせてハッシュだけを書き換えてはいけません。新しい公開版で作り直すなら、それは次の版です(下の「次の版へ」)。

## v23 を再生成する手順

```bash
cd tools/jaffpota
uv sync
B=../../packages/shared/common/json

# 1. 厳格な確認。複数区分の公園に未割当・重複があれば、推定割当をせずに止まる(終了コード 1)
uv run python -m jaffpota.generate specs/v23.json --base $B/jaffpota-annotated-v22.json --nps /path/to/nps.zip --out out/strict --strict

# 2. out/strict/problems.geojson を地図で確かめる(未割当を赤、重複を橙にすると区別しやすい)

# 3. 推定割当で生成する。仕様の件数と違えば終了コード 3
uv run python -m jaffpota.generate specs/v23.json --base $B/jaffpota-annotated-v22.json --nps /path/to/nps.zip --out out/gen

# 4. 配備中の v23 と区域として比べる
uv run python -m jaffpota.compare out/gen/jaffpota-annotated-v23.json $B/jaffpota-annotated-v23.json
```

手順 2 では、公園・断片ごとに見ます。赤い区域のすべてが新しく公園に指定された区域とは限りません。旧区域との差や、旧区分どうしの重なりも考えてください。
v22 の国立公園 32 件について、同名の新区域との差集合や旧 geometry ごとの重なり率が要るときは、`report.json` の公園別の新旧面積と `compare` の POTA ごとの面積を使います。この差分も、指定が解除された面積の確定情報ではありません。

### 基準値

固定版の入力とこの規則で生成した結果です。`specs/v23.json` の `expect`(生成直後)と `expect_final`(JP-0104 を除いた後)に書いてあり、生成のたびに照合します。

| 確認項目 | 生成直後 | 配備した v23 |
|---|---|---|
| POTA | 396(国立 35、国定・県立等 361) | 395(国定・県立等 360) |
| geometry | 1,441(Polygon 1,397、MultiPolygon 44) | 1,439(Polygon 1,395、MultiPolygon 44) |
| type:null | 0 | 0 |
| 推定割当が要った公園 | 10(JP-0001、0007、0008、0009、0016、0021、0023、0024、0026、0027) | 同じ |
| 旧区分どうしの重複 | 吉野熊野(JP-0021)だけ | 同じ |
| 潰れた小さな穴のリング | 2,812(外周の脱落は 0) | — |
| JP-0156 と JP-0032・JP-0033 の面積の重なり | 0 | 0 |

このほか、全 geometry の 5 属性が空でない文字列であること、UID が 1 からの連番であること、すべての arc が使われ 4 点以上であることを、`tests/test_release_data.py` が確かめます。

### ハッシュについて

2026-10-17 に作った v23 のハッシュは、生成直後が `b2ce4ef07fb9ce762ed6a55b6e83b3f2f1e447e0e5e994fa1305e57348b90e88`、配備したもの(JP-0104 を除いた後)が `2a7ce58acef978ebd25cb31c04d6a8051788b3d8e917026c12e68c0621fb65c6` です。
**このツールの出力は、これと一致しません。** そのときの変換プログラムは残っておらず、GEOS の演算に渡す順序の違いで、リングの始点と MultiPolygon の部分の順が変わるためです。
区域としては同じです。`compare` の結果は、geometry 1,439 件の属性と順序がすべて一致し、対称差の合計は 0.0024 m² でした。差はすべて吉野熊野の 1 geometry(57 km²)にある 2 つの細い穴で、旧区分どうしの重なりを処理する順序から出たものです。
そのため、再生成の合否はハッシュではなく、件数(`expect`)と `compare` で判断します。ハッシュは `reference_sha256` に参考値として残し、`report.json` の `reference_sha256_match` に一致したかを書きます。

## 出典の表示

国立公園の区域は、環境省生物多様性センターのデータを加工したものです。利用条件(PDL1.0)により、区域データを公開・表示するときは次のように書きます(詳しくは `tools/jaffpota/inputs/nps-2025-04-28/SOURCE.md`)。

> 国立公園区域 GIS データ(環境省生物多様性センター)(2026-10-17 ダウンロード)を使用し、JL1NIE(sotalive.net)が加工したものである。

v24 以降の国定・県立等は、国土数値情報を加工したものです。表示するときは次のように書きます。

> 「国土数値情報(自然公園地域データ)」(国土交通省)(https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A10-v3_1.html)を加工して作成

MyACT の画面には、まだこの表示がありません(下の「未完のこと」)。

## 生成の規則

`jaffpota/generate.py` はこの規則のとおりに作ってあります。面積と距離の計算には EPSG:6933、集合演算と出力の座標には WGS84(EPSG:4326)を使います。

### 公園名と POTA・JAFF の対応

Shape の公園名に「国立公園」を付けた名称を、v22 の描画できる geometry の `NAME` と照合します。35 件のうち 32 件が、同じ名称・POTA の既存の国立公園に対応します。
既存の公園に複数の JAFF/PID がある場合は、v22 の各 geometry が持つ (JAFF, PID) の組をそのまま区分の基準にします。POTA だけから JAFF を一つに決めたり、異なる旧区分をまとめたりしてはいけません。

v22 にない 3 公園は、次の値で追加します(`specs/v23.json` の `new_parks`)。PID と JAFF は文字列です。

| Shape の公園名 | POTA | JAFF | PID | 出力名 |
|---|---|---|---|---|
| 屋久島 | JP-0030 | JAFF-0090 | 030 | 屋久島国立公園 |
| やんばる | JP-0032 | JAFF-0097 | 032 | やんばる国立公園 |
| 慶良間諸島 | JP-0033 | JAFF-0092 | 033 | 慶良間諸島国立公園 |

名称の照合で、既存 32 件と新規 3 件が Shape の 35 公園と一対一に対応することを確かめます(対応しなければ生成は止まります)。対応があいまいなら名称だけで決めず、区域と MyACT の公園情報を確かめます。

### 区域を作る

1. 環境省 ZIP のハッシュを照合する。座標系が JGD2000(EPSG:4612)の経緯度、属性が公園名 `NAME` と地種区分 `ZONE`、図形が Polygon であることを確かめる。固定版では 15,293 レコード・35 公園名。図形を WGS84 に変換し、無効な形状を修復してポリゴン部分だけを残す。`ZONE` を問わず公園名ごとに統合し、その公園の区域とする。
2. v22 の TopoJSON を、transform と差分符号化された arcs から復号する。負の arc 番号は逆向きの参照として扱う。type:null と空図形を除き、描画できる geometry の元の順序と属性を保つ。v22 では type:null が 298 件あり、除いた後も 393 POTA が残る。
3. 国定・県立等の 361 POTA は、v22 の描画できる図形と属性を残す。**無効な形状は修復し(`make_valid` のあと `unary_union`)、修復で空になった図形(面積 0 のもの)は除く。有効な図形は座標を変えない。** v22 では JP-1453 南知多県立自然公園に、面積 0 の図形と自己交差のある図形がある。
4. ただし JP-0156 沖縄海岸国定公園からは、追加するやんばる・慶良間諸島の新区域を差し引く。境界を独立に量子化したときに重なりが戻らないよう、差し引く区域を EPSG:6933 で 0.1 m 広げてから経緯度に戻す。旧図形ごとに差し引き、空になった図形は除く。
5. 35 国立公園を公園名の順(文字コード順)に処理する。旧図形のない新規 3 公園には上の表の属性を付ける。旧図形の (JAFF, PID) が 1 種類の公園は、新区域の全体にその組を付ける。複数種類の公園は、旧図形を組ごとに統合し、組の辞書順に新区域との交差を割り当てる。先に割り当てた区域は、後の組から差し引く。
6. 複数区分を持つ公園では、新区域のうち旧区分の外にある部分(未割当)と、旧区分どうしの重なり(重複)を測る。どちらかが 1 m² を超えれば、公園名・POTA・未割当面積・重複面積・関係する JAFF/PID を診断結果に残す。`--strict` ではここで止める。v23 の入力では 10 公園に未割当があり、吉野熊野には旧区分どうしの重複もある。
7. 通常の生成では、未割当の各 Polygon を、最も近い旧 (JAFF, PID) 区分へ推定で割り当てる。EPSG:6933 での距離を小数第 6 位に丸めて比べ、同じなら未割当の図形を 10 m 広げた範囲との交差面積が大きい旧区分を、それも同じなら (JAFF, PID) の辞書順で先のものを選ぶ。断片を区分ごとに集め、区分ごとに 1 回で統合する。推定した面積は公園・区分ごとに記録する。**この境界は Shape の属性ではなく、旧区域からの推定です。**
8. 出力の順は、残す国定・県立等を POTA 順(同じ POTA の中は v22 の順)、その後に国立公園を公園名順・(JAFF, PID) 順とする。`NAME` は Shape の公園名に「国立公園」を付ける。`UID` は出力順に文字列の 1 から振り直す。公園全体を一つの geometry にまとめる必要はない(区分ごとに 1 geometry)。
9. 全出力の座標の最小・最大から、各軸の `scale = (max - min) / 999999999`、`translate = min` を求め、リングの座標を整数に丸める(numpy の `round`。端数がちょうど 0.5 なら偶数へ)。連続した重複点を除き、4 点未満になった穴は件数を記録して除く。外周が潰れたら止める。リングごとに独立した arc を作り、座標を差分符号化する。共有 arc の最適化はしない。UTF-8、空白なし、文字を ASCII にエスケープしない JSON と、末尾の改行 1 個で保存する。
10. 生成の後に、仕様の `remove_after_generate` にある POTA を除く(v23 では JP-0104 日高山脈襟裳国定公園。日高山脈襟裳十勝国立公園 JP-2107 へ格上げされ、DB でも inactive)。transform は変えず、除いた geometry だけが使う arc を消して番号を詰め、UID を振り直す。

診断結果(`report.json`)には、入力の取得元・日付・ハッシュ、公園別の新旧面積、未割当と重複の面積、推定割当の面積、JP-0156 から除いた面積、修復した旧図形の数と除いた図形、出力の件数、潰れた穴の件数が入ります。
未割当と重複の形状は `problems.geojson`(FeatureCollection)で、各 Feature に `POTA`、`NAME`、問題の種類(`kind`: `unassigned` か `overlap`)、面積が付きます。

## v24: 国定・県立等を原形にする

v23 までの国定・県立等は、v22 を簡略化したままの形でした(元は国土数値情報 自然公園地域 A10-10。山頂から 1 km 以内の境界で、ずれの中央値 4.5 m、99% が 44 m 以内、最大 897 m)。
v22 には形が空(type:null)の地物が 298 件あり、簡略化で消えた小島が多く含まれます。2010 年のあとに国立公園へ編入された区域も、JP-0156 のほかは差し引かれずに国立公園と重なっていました。
SOTA の山頂ごとの POTA 判定(sotaapp2)にはこの誤差が効くので、v24 では国定・県立等を A10 の原形から作り直します。仕様は `specs/v24.json` です。

```bash
cd tools/jaffpota
uv run python -m jaffpota.generate specs/v24.json --out out/v24 --a10 /path/to/A10-10.geojson
JAFFPOTA_A10=/path/to/A10-10.geojson uv run python -m unittest tests.test_reproduce -v   # 件数と、国立公園が v23 と同じこと
```

**A10 は repo に置きません。** 国土数値情報の自然公園地域データは「非商用」で、複製物の再配布ができません(国土数値情報ダウンロードサイトの利用約款)。この repo は公開なので、入力はパスで渡し、仕様にはハッシュだけを書きます。
固定版は都道府県別のファイルを QGIS で 1 つにまとめた GeoJSON(`A10-10.geojson`、1,949 地物、JGD2000 経緯度、SHA-256 `dd5c9e2b828bc1d1d8dd7aa0157b6349385259c0b1e9f5e1edeb48c9489c29da`)です。

規則(v23 の規則との違い):

1. 旧版は v23。国立公園は、v23 の区分(すでに 2025 年の Shape から作ったもの)をそのまま引き継ぐ(`national_from_base`)。推定割当は起きない。
2. A10 の国立公園(`A10_003` = 1)は使わない。それ以外の各地物に、同じ PID(`A10_005`)の v23 の地物のうち最も重なるものの JAFF・PID・POTA・NAME を付ける。重ならない地物(v23 で消えていた小島など)は、同じ PID の最も近い地物の属性にする。v23 に同じ PID がない地物は除く(固定版では PID 104・110・154・215・398・399。どれも国立公園に編入・格上げされた公園)。
3. 同じ属性の地物を一つの geometry に統合する。v23 のように地物ごとに分けない。
4. 全国立公園の区域(Shape。0.1 m 広げる)と重なる部分を、すべての国定・県立等から差し引く。v23 の `subtract`(JP-0156 だけ)はこれに含まれる。固定版では 39 POTA から差し引き、大きいのは JP-0156 の 204.7 km²、JP-1405 奥越高原の 22.6 km²。
5. A10 に形がない v23 の公園は、v23 の形を残す(固定版では 0 件)。
6. 符号化の前に、1 m² 未満の部分を除く(`drop_parts_below_m2`)。全体の範囲が変わって量子化の刻みが変わり、v23 では残っていた数 mm の楔の外周が潰れるため。固定版では 9 部分。
7. 国定・県立等どうしの重なりは直さずに `report.json` の `others.overlaps_between_others` に記録する(固定版では JP-0137 と JP-1532 の 86 m² だけ)。

結果は 395 POTA、416 geometry です。

**表示用と判定用の 2 つを出力します**(仕様の `display`)。

| ファイル | 中身 | 使う場所 |
|---|---|---|
| `jaffpota-annotated-v24.json` | 各 geometry を EPSG:6933 で 2 m 簡略化した版(位相は保つ)。14.3 MB、頂点 101 万 | MyACT(共通アセットに置く) |
| `jaffpota-annotated-v24-full.json` | 簡略化しない版。22.6 MB、頂点 171 万 | sotaapp2 の山頂ごとの POTA 判定(バッチ)。repo には置かない |

簡略化しない版は Cloudflare Pages の 1 ファイル 25 MiB の上限に近く、携帯での描画も重くなるためです。2 m はズーム 18(1 画素 約 0.5 m)でも線の太さの中にほぼ収まります。隣り合う公園の境界は別々に簡略化するので、最大 2 m の隙間や重なりができます。
MyACT の画面には、公園区域の出典(下の「出典の表示」)を地図の右下に出します。

## 確かめてから組み込む

1. 生成した JSON を `uv run python -m jaffpota.release bump out/gen/jaffpota-annotated-vN.json` で置く。参照の差し替えと検証まで行う。
2. 旧版 MyACT で区域の表示を確かめる。通常のクリックで POTA・JAFF・公園名が、右クリックで PID・UID も出ること。v23 では特に、霧島錦江湾 JP-0029 と屋久島 JP-0030 が別の公園として出ることと、沖縄海岸国定公園 JP-0156 と新規 2 国立公園の境界に重なりがないことを見る。
3. `JAFFPOTA_API` を付けて検証し、全 POTA が DB にあって active であることを確かめる。

2026-10-17 の引き継ぎ時点では、ブラウザーでのクリック表示は確かめていません。

## DB とのずれを直す(patch)

**DB が唯一の正**で、JSON は DB に合わせます。公園の統合・廃止などで JSON と DB がずれたら、先に sotaapp2 の管理画面で DB を直します(廃止した公園は `parkInactive` をオン、新しい公園は `wwffCode` を設定、`parkNameJ` を確認)。

```bash
cd tools/jaffpota
uv run python -m jaffpota.patch --dry-run              # 差分の確認だけ
uv run python -m jaffpota.patch --out /tmp/new.json    # 対話式に直して別ファイルへ
uv run python -m jaffpota.release bump /tmp/new.json   # 次の版として置く
```

`patch` は、各 geometry の POTA を `GET /api/v2/pota/parks/{code}` で照合します(POTA と JAFF の組で探し、見つからなければ JAFF で探す)。`JA-XXXX` は `JP-XXXX` に自動で直します。
DB にない・非表示の POTA では、新しい POTA コードを尋ねます。Enter で飛ばし、`q` で終わります。入力したコードが DB にあれば、POTA・JAFF・NAME をその値にします。

`--out` を付けずに最新版を上書きすることもできます。ただし、その場合はファイル名の版が変わらないので、ブラウザーや CDN のキャッシュに古い内容が残ることがあります。

例(2026-05 の御嶽山の統合):

1. DB: JP-2123 の `wwffCode` を `JAFF-0189` にする
2. DB: JP-1432 と JP-1335 を `parkInactive` にする
3. `patch --dry-run` で差分を確かめる
4. `patch --out` で JP-2123 を入力して確定し、`release bump` で次の版にする

## 次の版へ

上のハッシュと件数は、2025-04-28 の公開版から v23 を作るための基準です。環境省の ZIP が更新されたら、次を調べてから `specs/v24.json` を作り、新しい版として生成します。

- 取得元・日付・利用条件・チェックサム
- 公園名と属性、座標系
- 旧版との区域の差(`compare` の POTA ごとの面積)
- 公園の追加・分離と、POTA・JAFF の対応(`new_parks`)
- 旧区分から推定した境界(`report.json` の推定割当)
- 国定・県立等との重なりの除去(`subtract`)と、DB で inactive になった公園(`remove_after_generate`)

旧版には v23 を使います(`--base` と `base.sha256`)。より新しい原典を確かめられない国定・県立等は、v22 由来であることを明示してください。

## 未完のこと

- React 版 MyACT(`apps/myact/src/components/Map/layers/ParkPolygonLayer.tsx`)は v22 を読んでいます。`release bump` の差し替えの対象にも入れていません。v23 に替えるなら、読み込み先を替え、`jaffpota/release.py` の `REFERENCES` に足してください。`apps/myact/public/json/` の v22 の写しは、共通アセットの `/json/` と重なっています。
- ブラウザーでのクリック表示(上の「確かめてから組み込む」の 2)は、まだ確かめていません。
