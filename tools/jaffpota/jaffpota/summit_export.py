"""sotaapp2 に入れる、山頂の推定・下地の地図・目視の答えを作る。

    uv run python -m jaffpota.summit_export --parks v24-full.json --munitable munitable.csv --n03 N03.shp \\
        --zones zones_all2 --data data2.json --city-j-fixes city_j_fixes.csv --db sotaapp2.db --out out/ \\
        [--saved db_dump/verdicts2] [--rereview db_dump5/verdicts] [--manual manual_fixes.csv]

出力(`--out`):
  summit_pota.csv   山頂 × 市区町村(JCC/JCG)× POTA の組と推定の答え。なしの組と根拠も出す。目視の答えは混ぜない。
                    sotaapp2 の `POST /sota/import/pota` に渡す(列の仕様は sotaapp2 の docs/summit-map-admin-design.md 8 章)
  summit_maps.jsonl 山頂ごとの簡易地図の下地(GeoJSON、経緯度)。1 行 1 山頂。答えを焼き込まない。
                    `POST /sota/import/maps` に渡す(サーバーが答えを差し込む)
  verdicts.json     目視の答え。`python -m jaffpota.migrate_verdicts` が sotaapp2 に移す
  summary.json      件数

入力のうち、N03(国土数値情報の行政区域)・A10 などの再配布できないデータは、repo に置かず、パスで渡す。
手順と規則は docs/summit-batch.md。
"""
import argparse
import collections
import csv
import glob
import hashlib
import json
import multiprocessing
import os
import sqlite3
import sys
import time
from pathlib import Path

import shapefile
import shapely
from shapely.geometry import box, mapping, shape
from shapely.ops import polylabel

from . import generate as G
from . import summit_pairs as sp
from . import topo

SIMPLIFY = 1.0  # m
ATTR = "公園区域: 国土数値情報(自然公園地域)・環境省 自然環境保全基礎調査 を加工 / 市区町村境: 国土数値情報(行政区域)を加工"
REV_PREFIX = "r1-"

CSV_COLUMNS = ["summit_code", "muni_key", "muni_name", "pota_code", "coverage",
               "pct", "px", "tot_px", "dist_m", "noise", "shallow", "hint", "needs_review", "note",
               "input_rev", "latitude", "longitude", "park_version", "muni_version", "munitable_version",
               "reasons", "change_note"]


def rnd(geom):
    return shapely.set_precision(geom, 1e-5)


def feat(kind, geom, **props):
    return {"type": "Feature", "properties": {"kind": kind, **props}, "geometry": mapping(geom)}


def file_version(path):
    """入力ファイルの版。ファイル名(拡張子なし)と、内容のハッシュの先頭 8 桁"""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return f"{Path(path).stem}-{h.hexdigest()[:8]}"


class Geo:
    """バッチが使う図形(経緯度)と、市区町村のキーの表"""

    def __init__(self, parks, munis, key2muni, mrow):
        self.P = G.Projector()
        self.parks = parks  # POTA コード → 公園の区域
        self.munis = munis  # 市区町村コード → 区域
        self.key2muni = key2muni  # JCC/JCG のキー → 市区町村コードの集合
        self.mrow = mrow  # 市区町村コード → munitable の行
        self.mcodes = sorted(munis)
        self.mtree = shapely.STRtree([munis[c] for c in self.mcodes])

    @classmethod
    def load(cls, parks_path, munitable_path, n03_path):
        pg = collections.defaultdict(list)
        with open(parks_path, encoding="utf-8") as f:
            parks_topo = json.load(f)
        for p, g in topo.decode(parks_topo):
            v = G.valid(g)
            if v is not None:
                pg[p["POTA"]].append(v)
        parks = {c: G.valid(shapely.union_all(v)) for c, v in pg.items()}

        key2muni = collections.defaultdict(set)
        mrow = {}
        with open(munitable_path, encoding="utf-8") as f:
            for m in csv.DictReader(f):
                cd = int(m["muniCd"])
                mrow[cd] = m
                if m["JCCCd"]:
                    key2muni["JCC#" + m["JCCCd"]].add(cd)
                if m["WDCd"]:
                    key2muni["JCC#" + m["WDCd"]].add(cd)
                if m["JCGCd"] and m["hamlogCd"]:
                    key2muni["JCG#" + m["JCGCd"] + m["hamlogCd"]].add(cd)
        r = shapefile.Reader(n03_path, encoding="utf-8")
        mg = collections.defaultdict(list)
        for rec, shp in zip(r.iterRecords(), r.iterShapes()):
            if rec["N03_007"]:
                mg[int(rec["N03_007"])].append(shape(shp.__geo_interface__))
        munis = {c: shapely.union_all(v) for c, v in mg.items()}
        return cls(parks, munis, key2muni, mrow)

    def key_name(self, key):
        cds = sorted(self.key2muni.get(key, ()))
        if not cds:
            return ""
        if key.startswith("JCC#") and len(cds) > 1:
            m = self.mrow[cds[0]]  # 区のない市(区ごとの行をまとめた JCC)
            return m["Pref"] + m["City"].split(" ")[0]

        # JCG は郡の中の町村なので、郡名も付ける(南都留郡富士河口湖町。交信で聞かれるのは郡)
        def one(c):
            m = self.mrow[c]
            gun = m["JCG_text"] if key.startswith("JCG#") else ""
            return m["Pref"] + gun + m["City"].replace(" ", "")

        return "・".join(one(c) for c in cds)

    def key_geom(self, key):
        cds = {int(key[4:])} if key.startswith("N03#") else self.key2muni.get(key, set())
        g = [self.munis[c] for c in cds if c in self.munis]
        return shapely.union_all(g) if g else None


def lonlat(P, gm):
    """メートル座標の図形を簡略化して経緯度に戻す"""
    g = G.valid(gm.simplify(SIMPLIFY)) if gm.geom_type.endswith("Polygon") else gm.simplify(SIMPLIFY)
    if g is None or g.is_empty:
        return None
    g = rnd(P.lonlat(g))
    return None if g.is_empty else g


def compute_input_rev(lat, lon, zone, areas, parks, pair_ids):
    """山頂の推定を決めた入力の指紋。

    山頂の位置(小数 5 桁)、ゾーンの形、ゾーンにかかる市区町村のキーとその区域(地図の窓で切ったもの)、
    候補の公園のコードとその区域(窓で切ったもの)、候補の組。窓の外の変更では変わらない。
    図形は、地図に出す丸め済みの座標(経緯度、小数 5 桁)を使う。
    """
    payload = {"v": 1, "pos": [round(lat, 5), round(lon, 5)], "zone": zone, "areas": areas, "parks": parks,
               "pairs": sorted(pair_ids)}
    blob = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return REV_PREFIX + hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def build_summit_map(geo, code, lat, lon, zone_geom, zkeys, pairs, estimates, name, alt, park_name):
    """山頂の簡易地図の下地と、入力の指紋を返す。ゾーンを描けなければ None。

    zone_geom: ゾーンの GeoJSON geometry(経緯度)  zkeys: ゾーンにかかる市区町村のキー
    pairs: 候補の組 [{"key", "pota"}]  estimates: {"key|pota": 推定の答え}
    要素: zone / border / muni(文字の位置と、推定が all/part の POTA)/ area(市区町村の区域)/
          park(候補の公園の、その市区町村の中の区域。答えが「一部」になったときに描く)/
          judge_park(候補の公園の元の区域。見直しの画面だけが使う)/ summit
    """
    P = geo.P
    zone = shape(zone_geom)
    zm = P.metric(zone)
    sp_ = P.metric(shapely.Point(lon, lat))
    x0, y0, x1, y1 = shapely.union(zm, sp_).bounds
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half = max(250.0, (x1 - x0) / 2 + 200, (y1 - y0) / 2 + 200)
    winm = box(cx - half, cy - half, cx + half, cy + half)
    win = P.lonlat(winm)

    zone_ll = lonlat(P, zm)
    if zone_ll is None:
        return None
    feats = [feat("zone", zone_ll)]

    # 市区町村境
    near = [geo.mcodes[i] for i in geo.mtree.query(win, predicate="intersects")]
    bl = [shapely.intersection(P.metric(geo.munis[c]).boundary, winm) for c in near]
    b = shapely.union_all([x for x in bl if not x.is_empty]) if bl else None
    if b is not None and not b.is_empty:
        b = shapely.line_merge(b) if b.geom_type == "MultiLineString" else b
        lb = lonlat(P, b)
        if lb is not None:
            feats.append(feat("border", lb))

    # 市区町村ごとの文字の位置と POTA。公園の区域は、その市区町村の中だけを描く
    inner = box(cx - half * 0.8, cy - half * 0.8, cx + half * 0.8, cy + half * 0.8)
    areas = {}
    for k in zkeys:
        g = geo.key_geom(k)
        if g is None:
            continue
        gmet = P.metric(g)
        part = shapely.intersection(zm, gmet)
        if part.is_empty:
            continue
        reg = shapely.difference(shapely.intersection(gmet, inner), zm.buffer(15))
        if reg.is_empty or reg.area < (half * 0.15) ** 2:
            reg = part
        big = max(shapely.get_parts(reg), key=lambda x: x.area)
        lp = rnd(P.lonlat(polylabel(big, tolerance=half / 50)))
        codes = sorted({p["pota"] for p in pairs if p["key"] == k})
        pl = [{"code": c, "name": park_name.get(c, ""), "coverage": estimates[sp.pair_id(k, c)]}
              for c in codes if estimates[sp.pair_id(k, c)] in ("all", "part")]
        feats.append(feat("muni", lp, key=k, name=geo.key_name(k), pota=pl))
        # 市区町村の区域(地図の範囲で切り抜いたもの)。現在地がどの市区町村かを、端末で判定するのに使う
        in_win = shapely.intersection(gmet, winm)
        la = lonlat(P, in_win)
        if la is not None:
            feats.append(feat("area", la, key=k))
            areas[k] = mapping(la)
        for c in codes:
            if c not in geo.parks:
                continue
            pm = shapely.intersection(P.metric(geo.parks[c]), in_win)
            lpm = lonlat(P, pm) if not pm.is_empty else None
            if lpm is not None:
                feats.append(feat("park", lpm, code=c, key=k))

    # 候補の公園の元の区域(市区町村で切らない)
    judge = {}
    for c in sorted({p["pota"] for p in pairs}):
        if c not in geo.parks:
            continue
        pm = shapely.intersection(P.metric(geo.parks[c]), winm)
        lpm = lonlat(P, pm) if not pm.is_empty else None
        if lpm is not None:
            feats.append(feat("judge_park", lpm, code=c))
            judge[c] = mapping(lpm)

    feats.append(feat("summit", rnd(shapely.Point(lon, lat)), code=code, name=name, alt=alt))
    bb = [round(v, 5) for v in win.bounds]
    fc = {"type": "FeatureCollection", "summit": code, "bbox": bb, "attribution": ATTR, "features": feats}
    rev = compute_input_rev(lat, lon, mapping(zone_ll), areas, judge, [sp.pair_id(p["key"], p["pota"]) for p in pairs])
    return fc, rev


def estimate_rows(code, summit, has_saved, name_of, meta):
    """推定の CSV の行(組ごと)。meta は山頂の列"""
    rows = []
    for p in sorted(summit["pairs"], key=lambda p: (p["key"], p["pota"])):
        rows.append({
            "summit_code": code, "muni_key": p["key"], "muni_name": name_of(p["key"]), "pota_code": p["pota"],
            "coverage": sp.estimate_answer(p, has_saved),
            "pct": p["pct"], "px": p["px"], "tot_px": p["tot"],
            "dist_m": "" if p["dist"] is None else p["dist"],
            "noise": int(p["noise"]), "shallow": int(p["shallow"]),
            "hint": sp.hint_for(p, has_saved) or "",
            "needs_review": int(p["review"]),
            "note": sp.note_for(p, summit, has_saved) or "",
            **meta,
        })
    return rows


def read_verdict_dir(path):
    """判定表の verdicts を書き出したディレクトリを読む {code: {"pairs": {...}}}"""
    V = {}
    for f in glob.glob(f"{path}/*.json"):
        with open(f, encoding="utf-8") as fh:
            d = json.load(fh)
        V.update(d.get("data", d).get("v", {}))
    return V


def map_results(codes, work, jobs=1):
    """`work(code)` の結果を、`codes` の順に返す。`jobs` が 2 以上なら、fork したプロセスで並列に計算する。

    山頂ごとの地図は、互いに独立(読み込み済みの図形を読むだけ)なので並列にできる。fork なので、読み込み済みの
    N03・公園区域は、コピーせずに子プロセスが共有する(メモリは増えない)。結果は `codes` の順に返るので、
    直列のときと同じ出力になる。`work` はモジュールの関数(fork したプロセスに渡すため)。
    失敗したら、そこで止まる(どの山頂かは、`work` が例外に入れる)。
    """
    if jobs <= 1 or len(codes) <= 1:
        for c in codes:
            yield work(c)
        return
    try:
        ctx = multiprocessing.get_context("fork")
    except ValueError:  # fork がない環境(Windows)では、直列で
        print("fork が使えないので、並列にせず、直列で処理します", file=sys.stderr)
        for c in codes:
            yield work(c)
        return
    with ctx.Pool(min(jobs, len(codes))) as pool:
        yield from pool.imap(work, codes, chunksize=8)


# 並列の子プロセスが読む、読み込み済みの入力(main が fork の前に入れる)
_STATE: dict = {}


def _summit_line(code):
    """1 山頂の地図の 1 行(JSON)と input_rev。ゾーンを描けなければ None"""
    st = _STATE
    lat, lon = st["info"][code]
    d = st["D"].get(code)
    pairs = d["pairs"] if d else []
    has_saved = st["has_saved"].get(code, False)
    estimates = {sp.pair_id(p["key"], p["pota"]): sp.estimate_answer(p, has_saved) for p in pairs}
    try:
        r = build_summit_map(st["geo"], code, lat, lon, st["zones"][code]["geometry"], st["zkeys"].get(code, []), pairs,
                             estimates, st["summit_name"].get(code, ""), st["summit_alt"].get(code), st["park_name"])
    except Exception as e:  # 並列のとき、どの山頂か分かるように
        raise RuntimeError(f"{code}: {type(e).__name__}: {e}") from e
    if r is None:
        return None
    fc, rev = r
    return json.dumps(fc, ensure_ascii=False, separators=(",", ":")), rev, bool(pairs)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--parks", required=True, help="判定用の公園区域(jaffpota-annotated-vN-full.json)")
    ap.add_argument("--munitable", required=True)
    ap.add_argument("--n03", required=True, help="国土数値情報 行政区域の Shape(.shp)")
    ap.add_argument("--zones", required=True, help="batch_zones.py の出力(zones.geojson と summit_muni.csv)")
    ap.add_argument("--data", required=True, help="review2_data の出力(data2.json)")
    ap.add_argument("--city-j-fixes", required=True)
    ap.add_argument("--db", required=True, help="sotaapp2 の DB の写し(山頂の位置・名前)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--saved", help="判定表の verdicts を書き出したディレクトリ(確かめたと分かっている山頂だけ使う)")
    ap.add_argument("--rereview", help="見直しの判定表の verdicts を書き出したディレクトリ(前の判定表より優先)")
    ap.add_argument("--manual", help="判定表の外で分かった答え(summit,muni_key,pota_code,coverage。いちばん優先)")
    ap.add_argument("--park-version")
    ap.add_argument("--muni-version")
    ap.add_argument("--munitable-version")
    ap.add_argument("--jobs", type=int, default=1,
                    help="地図を作るプロセスの数(既定 1 = 直列。0 は CPU の数)。出力は直列と同じ。読み込み(約 40 秒)は直列のまま")
    ap.add_argument("--limit", type=int, help="先頭の何山頂ぶんだけ地図を作る(確認用。CSV と verdicts は全部)")
    a = ap.parse_args(argv)

    versions = {
        "park_version": a.park_version or file_version(a.parks),
        "muni_version": a.muni_version or file_version(a.n03),
        "munitable_version": a.munitable_version or file_version(a.munitable),
    }
    geo = Geo.load(a.parks, a.munitable, a.n03)
    print("loaded", file=sys.stderr, flush=True)

    wrong = collections.defaultdict(set)
    with open(a.city_j_fixes, encoding="utf-8") as f:
        for x in csv.DictReader(f):
            wrong[x["summit"]].add(x["wrong"])
    zkeys = collections.defaultdict(list)
    with open(f"{a.zones}/summit_muni.csv", encoding="utf-8") as f:
        for x in csv.DictReader(f):
            k = x["muni_key"] or (f"N03#{x['muni_code']}" if x["muni_code"] else "")
            if k and int(x["pixels"]) > 0 and k not in wrong[x["summit"]] and k not in zkeys[x["summit"]]:
                zkeys[x["summit"]].append(k)
    with open(f"{a.zones}/zones.geojson", encoding="utf-8") as f:
        zones = {x["properties"]["summit"]: x for x in json.load(f)["features"]}
    with open(a.data, encoding="utf-8") as f:
        D = {s["code"]: s for s in json.load(f)["summits"]}

    con = sqlite3.connect(a.db)
    info = {c: (la, lo) for c, la, lo in con.execute(
        "select summit_code, latitude, longitude from sota_references where summit_code like 'JA%/%'")}
    summit_name = {c: (nj or n or "") for c, nj, n in con.execute(
        "select summit_code, summit_name_j, summit_name from sota_references where summit_code like 'JA%/%'")}
    summit_alt = dict(con.execute("select summit_code, alt_m from sota_references where summit_code like 'JA%/%'"))
    park_name = dict(con.execute("select pota_code, park_name_j from pota_references where pota_code like 'JP-%'"))
    con.close()

    # 目視の答え
    saved = {c: v.get("pairs", {}) for c, v in read_verdict_dir(a.saved).items()} if a.saved else {}
    rereview = {c: v["pairs"] for c, v in read_verdict_dir(a.rereview).items()} if a.rereview else {}
    manual = []
    if a.manual:
        with open(a.manual, encoding="utf-8") as f:
            manual = list(csv.DictReader(f))
    has_saved = {c: bool(saved.get(c)) for c in D}
    verdicts = sp.build_verdicts({c: s["pairs"] for c, s in D.items()}, saved, rereview, manual, has_saved)

    os.makedirs(a.out, exist_ok=True)
    revs = {}
    n = 0
    codes = [c for c, f in sorted(zones.items()) if f["geometry"] and c in info]
    if a.limit:
        codes = codes[: a.limit]
    jobs = (os.cpu_count() or 1) if a.jobs == 0 else max(1, a.jobs)
    _STATE.update(geo=geo, info=info, D=D, has_saved=has_saved, zones=zones, zkeys=zkeys,
                  summit_name=summit_name, summit_alt=summit_alt, park_name=park_name)
    t0 = time.monotonic()
    with open(f"{a.out}/summit_maps.jsonl", "w", encoding="utf-8") as fo:
        for code, res in zip(codes, map_results(codes, _summit_line, jobs)):
            if res is None:
                continue
            line, rev, has_pairs = res
            if has_pairs:
                revs[code] = rev
            fo.write(line + "\n")
            n += 1
            if n % 1000 == 0:
                print(n, code, f"{time.monotonic() - t0:.0f}s", file=sys.stderr, flush=True)
    print(f"地図 {n} 山頂({jobs} プロセス、{time.monotonic() - t0:.0f} 秒)", file=sys.stderr, flush=True)

    rows = 0
    with open(f"{a.out}/summit_pota.csv", "w", encoding="utf-8", newline="") as fo:
        w = csv.DictWriter(fo, fieldnames=CSV_COLUMNS)
        w.writeheader()
        for code in sorted(D):
            s = D[code]
            lat, lon = info.get(code, (None, None))
            meta = {"input_rev": revs.get(code, ""), "latitude": "" if lat is None else lat,
                    "longitude": "" if lon is None else lon, **versions,
                    "reasons": ",".join(s["reasons"]), "change_note": ""}
            for row in estimate_rows(code, s, has_saved[code], geo.key_name, meta):
                w.writerow(row)
                rows += 1

    with open(f"{a.out}/verdicts.json", "w", encoding="utf-8") as fo:
        json.dump({"version": 1, "verdicts": verdicts}, fo, ensure_ascii=False, indent=1, sort_keys=True)
        fo.write("\n")
    summary = {"maps": n, "summits": len(D), "pairs": rows, "verdict_summits": len(verdicts),
               "verdict_pairs": sum(len(v) for v in verdicts.values()),
               "human_pairs": sum(1 for v in verdicts.values() for x in v.values() if x["source"] == "human"),
               "versions": versions}
    with open(f"{a.out}/summary.json", "w", encoding="utf-8") as fo:
        json.dump(summary, fo, ensure_ascii=False, indent=1)
        fo.write("\n")
    print(json.dumps(summary, ensure_ascii=False), file=sys.stderr)


if __name__ == "__main__":
    main()
