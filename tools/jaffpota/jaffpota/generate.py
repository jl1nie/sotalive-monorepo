"""旧版の公園区域 TopoJSON と環境省の国立公園 Shape から、新しい版の公園区域を生成する。

規則は docs/park-areas.md の「区域を生成する」と、版ごとの仕様ファイル(specs/vN.json)に従う。

    uv run python -m jaffpota.generate specs/v23.json --out out/ [--strict] [--base 旧版.json] [--nps nps.zip]

--base を省くと packages/shared/common/json/ の仕様の旧版を、--nps を省くと仕様の path(tools/jaffpota からの相対)を読む。

--strict は、複数区分の公園に未割当・重複があれば推定割当をせずに止める(最初の確認用)。
出力は out/ の jaffpota-annotated-vN.json、report.json(診断)、problems.geojson(未割当・重複の形状)。
"""
import argparse
import hashlib
import io
import json
import sys
import time
import zipfile
from itertools import combinations
from pathlib import Path

import numpy as np
import shapefile
import shapely
from pyproj import Transformer
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, mapping, shape

from . import topo

AREA_CRS = "EPSG:6933"
OUT_CRS = "EPSG:4326"


class SpecError(RuntimeError):
    pass


def sha256(data):
    return hashlib.sha256(data).hexdigest()


_T0 = time.monotonic()


def log(msg):
    print(f"[{time.monotonic() - _T0:7.1f}s] {msg}", file=sys.stderr, flush=True)


def check(cond, msg):
    if not cond:
        raise SpecError(msg)


class Projector:
    """経緯度(EPSG:4326)と面積・距離用の EPSG:6933 の相互変換。"""

    def __init__(self):
        self._fw = Transformer.from_crs(OUT_CRS, AREA_CRS, always_xy=True)
        self._bw = Transformer.from_crs(AREA_CRS, OUT_CRS, always_xy=True)

    @staticmethod
    def _apply(tr, g):
        return shapely.transform(g, lambda c: np.column_stack(tr.transform(c[:, 0], c[:, 1])))

    def metric(self, g):
        return self._apply(self._fw, g)

    def lonlat(self, g):
        return self._apply(self._bw, g)

    def area(self, g):
        return 0.0 if g is None or g.is_empty else self.metric(g).area


def polygonal(g):
    """図形のポリゴン部分だけを Polygon か MultiPolygon で返す。なければ None。"""
    if g is None or g.is_empty:
        return None
    if isinstance(g, (Polygon, MultiPolygon)):
        return g
    if isinstance(g, GeometryCollection):
        polys = [p for part in g.geoms if (q := polygonal(part)) is not None for p in topo.polygons_of(q)]
        if not polys:
            return None
        return polys[0] if len(polys) == 1 else MultiPolygon(polys)
    return None


def valid(g):
    """無効な形状を修復(make_valid のあと unary_union で統合)してポリゴン部分だけを残す。有効ならそのまま。

    統合まで行うのは、v23 を作ったときの処理に合わせるため。これで、残す国定・県立等の図形は
    配備中の v23 とリングの始点・部分の順まで一致する(国立公園の部分は区域だけが一致。docs/park-areas.md)。
    """
    if g is None or g.is_empty:
        return None
    return polygonal(g) if g.is_valid else polygonal(shapely.unary_union(shapely.make_valid(g)))


def union(gs):
    gs = [valid(g) for g in gs if g is not None and not g.is_empty]
    gs = [g for g in gs if g is not None]
    return polygonal(shapely.unary_union(gs)) if gs else None


def difference(a, b):
    if a is None:
        return None
    a, b = valid(a), valid(b)
    if a is None or b is None:
        return a
    return polygonal(a.difference(b))


def intersection(a, b):
    if a is None or b is None:
        return None
    a, b = valid(a), valid(b)
    return None if a is None or b is None else polygonal(a.intersection(b))


# ---- 入力 ----

def load_base(spec, raw):
    s = spec["base"]
    check(sha256(raw) == s["sha256"], f"旧版のハッシュが仕様と違う: {sha256(raw)}")
    entries = topo.decode(json.loads(raw))
    nulls = sum(1 for _, g in entries if g is None or g.is_empty)
    drawable = [(p, g) for p, g in entries if g is not None and not g.is_empty]
    e = s.get("expect", {})
    if "null_geometries" in e:
        check(nulls == e["null_geometries"], f"旧版の type:null が {nulls} 件(期待 {e['null_geometries']})")
    pota = {p["POTA"] for p, _ in drawable}
    if "pota" in e:
        check(len(pota) == e["pota"], f"旧版の POTA が {len(pota)} 件(期待 {e['pota']})")
    return drawable, nulls


def load_nps(spec, raw):
    s = spec["nps"]
    check(sha256(raw) == s["sha256"], f"国立公園 Shape ZIP のハッシュが仕様と違う: {sha256(raw)}")
    z = zipfile.ZipFile(io.BytesIO(raw))
    names = {n.rsplit(".", 1)[-1].lower(): n for n in z.namelist() if "." in n}
    for ext in ("shp", "shx", "dbf", "prj"):
        check(ext in names, f"ZIP に .{ext} がない")
    prj = z.read(names["prj"]).decode("ascii", "replace")
    check("JGD_2000" in prj and "GEOGCS" in prj and "PROJCS" not in prj, f"座標系が JGD2000 の経緯度でない: {prj}")
    r = shapefile.Reader(shp=io.BytesIO(z.read(names["shp"])), shx=io.BytesIO(z.read(names["shx"])),
                         dbf=io.BytesIO(z.read(names["dbf"])), encoding=s["encoding"])
    check(r.shapeType == shapefile.POLYGON, f"図形が Polygon でない: {r.shapeTypeName}")
    fields = [f[0] for f in r.fields[1:]]
    check({"NAME", "ZONE"} <= set(fields), f"属性に NAME・ZONE がない: {fields}")
    tr = Transformer.from_crs(s["crs"], OUT_CRS, always_xy=True)
    by_name = {}
    n = 0
    for sr in r.iterShapeRecords():
        n += 1
        g = shape(sr.shape.__geo_interface__)
        g = shapely.transform(g, lambda c: np.column_stack(tr.transform(c[:, 0], c[:, 1])))
        g = polygonal(shapely.make_valid(g))
        if g is not None:
            by_name.setdefault(sr.record["NAME"], []).append(g)
    e = s.get("expect", {})
    check(n == e.get("records", n), f"Shape のレコードが {n} 件(期待 {e.get('records')})")
    check(len(by_name) == e.get("parks", len(by_name)), f"Shape の公園名が {len(by_name)} 件(期待 {e.get('parks')})")
    return {name: union(gs) for name, gs in by_name.items()}, n


# ---- 区域の組み立て ----

def match_parks(spec, nps, drawable):
    """Shape の公園名ごとに、旧版の geometry と POTA を対応付ける。"""
    suffix = spec["national_suffix"]
    new_parks = spec["new_parks"]
    old_pota = {p["POTA"] for p, _ in drawable}
    matched = {}
    for name in sorted(nps):
        old = [(p, g) for p, g in drawable if p["NAME"] == name + suffix]
        pota = {p["POTA"] for p, _ in old}
        if old:
            check(len(pota) == 1, f"{name}: 旧版で POTA が一つに決まらない {sorted(pota)}")
            check(name not in new_parks, f"{name}: 旧版にあるのに新規として指定されている")
            matched[name] = (pota.pop(), old)
        else:
            check(name in new_parks, f"{name}: 旧版にも新規の表にもない。区域と MyACT の公園情報を確認すること")
            check(new_parks[name]["POTA"] not in old_pota, f"{name}: 新規の POTA {new_parks[name]['POTA']} が旧版に既にある")
            matched[name] = (new_parks[name]["POTA"], [])
    check(set(new_parks) <= set(nps), f"新規の表にあって Shape にない公園: {sorted(set(new_parks) - set(nps))}")
    pota = [p for p, _ in matched.values()]
    check(len(pota) == len(set(pota)), "Shape の公園と POTA が一対一でない")
    leftovers = sorted({p["POTA"] for p, _ in drawable if p["NAME"].endswith(suffix)} - set(pota))
    check(not leftovers, f"旧版の国立公園で Shape に対応しないもの: {leftovers}")
    return matched


def retained(spec, nps, drawable, national_pota, proj, report):
    """国定・県立等の旧区域。POTA 順(同じ POTA は旧版の順)にし、無効な形状を修復して、指定の区域を差し引く。

    有効な図形は座標を変えない。修復で空になった図形(面積 0 など)は除く。
    """
    keep = sorted([(p, g) for p, g in drawable if p["POTA"] not in national_pota], key=lambda e: e[0]["POTA"])
    repaired = [(p, valid(g)) for p, g in keep]
    report["repaired"] = {
        "invalid": sum(1 for _, g in keep if not g.is_valid),
        "dropped_empty": [p["UID"] for (p, _), (_, v) in zip(keep, repaired) if v is None],
    }
    keep = [(p, g) for p, g in repaired if g is not None]
    cuts = {}
    for s in spec.get("subtract", []):
        cut = union([nps[n] for n in s["parks"]])
        cuts[s["from"]] = (proj.lonlat(proj.metric(cut).buffer(s["buffer_m"])), s)
    out, removed = [], {}
    for p, g in keep:
        if p["POTA"] in cuts:
            cut, s = cuts[p["POTA"]]
            before = proj.area(g)
            g = difference(g, cut)
            r = removed.setdefault(p["POTA"], {"parks": s["parks"], "buffer_m": s["buffer_m"], "removed_m2": 0.0, "dropped_geometries": 0})
            r["removed_m2"] += before - proj.area(g)
            if g is None:
                r["dropped_geometries"] += 1
                continue
        out.append((p, g))
    report["subtracted"] = removed
    return out


def national(spec, name, pota, old, new, proj, strict, report, problems):
    """一つの国立公園の新区域を、旧版の (JAFF, PID) 区分に分けて (properties, geometry) の一覧にする。"""
    suffix = spec["national_suffix"]
    est = spec["estimate"]
    full = name + suffix
    entry = {"name": full, "POTA": pota, "new_m2": proj.area(new), "old_m2": proj.area(union([g for _, g in old]))}
    report["parks"].append(entry)
    if not old:
        a = spec["new_parks"][name]
        entry["new_park"] = True
        return [({"JAFF": a["JAFF"], "NAME": full, "PID": a["PID"], "POTA": pota}, new)]
    combos = sorted({(p["JAFF"], p["PID"]) for p, _ in old})
    entry["combos"] = [list(c) for c in combos]
    props = {c: {"JAFF": c[0], "NAME": full, "PID": c[1], "POTA": pota} for c in combos}
    if len(combos) == 1:
        return [(props[combos[0]], new)]

    olds = {c: union([g for p, g in old if (p["JAFF"], p["PID"]) == c]) for c in combos}
    parts, assigned = {}, None
    for c in combos:
        parts[c] = difference(intersection(new, olds[c]), assigned)
        assigned = union([assigned, parts[c]])
    unassigned = difference(new, union(list(olds.values())))
    overlap = union([intersection(olds[a], olds[b]) for a, b in combinations(combos, 2)])
    entry["unassigned_m2"] = proj.area(unassigned)
    entry["overlap_m2"] = proj.area(overlap)
    for kind, g in (("unassigned", unassigned), ("overlap", overlap)):
        if proj.area(g) > est["min_area_m2"]:
            problems.append({"type": "Feature", "geometry": mapping(g),
                             "properties": {"POTA": pota, "NAME": full, "kind": kind, "area_m2": proj.area(g),
                                            "combos": [f"{j}/{p}" for j, p in combos]}})
    if strict and (entry["unassigned_m2"] > est["min_area_m2"] or entry["overlap_m2"] > est["min_area_m2"]):
        return None

    if unassigned is not None:
        # 断片ごとに区分を決めて集め、区分ごとに 1 回だけ統合する(1 片ずつ統合すると断片数の 2 乗の時間がかかる)
        estimated, pieces = {}, {c: [] for c in combos}
        metric_olds = {c: proj.metric(olds[c]) for c in combos}
        for poly in topo.polygons_of(unassigned):
            m = proj.metric(poly)
            dist = {c: round(m.distance(metric_olds[c]), est["distance_decimals"]) for c in combos}
            best = min(dist.values())
            tied = [c for c in combos if dist[c] == best]
            if len(tied) > 1:
                near = m.buffer(est["tie_buffer_m"])
                inter = {c: near.intersection(metric_olds[c]).area for c in tied}
                top = max(inter.values())
                tied = [c for c in tied if inter[c] == top]
            c = tied[0]
            pieces[c].append(poly)
            estimated[f"{c[0]}/{c[1]}"] = estimated.get(f"{c[0]}/{c[1]}", 0.0) + m.area
        for c in combos:
            if pieces[c]:
                parts[c] = union([parts[c], *pieces[c]])
        entry["estimated_m2"] = estimated
    return [(props[c], parts[c]) for c in combos if parts[c] is not None]


def build(spec, base_raw, nps_raw, strict=False):
    """(topology または None, report, problems) を返す。strict で止まったときの topology は None。"""
    proj = Projector()
    report = {"spec_version": spec["version"], "inputs": {
        "base": {"file": spec["base"]["file"], "sha256": sha256(base_raw)},
        "nps": {"source": spec["nps"]["source"], "published": spec["nps"]["published"], "sha256": sha256(nps_raw)},
    }, "parks": []}
    problems = []
    drawable, nulls = load_base(spec, base_raw)
    log(f"旧版: 描画できる geometry {len(drawable)}、type:null {nulls}")
    nps, records = load_nps(spec, nps_raw)
    log(f"国立公園 Shape: {records} レコード、{len(nps)} 公園")
    report["inputs"]["base"].update(null_geometries=nulls, drawable=len(drawable), pota=len({p["POTA"] for p, _ in drawable}))
    report["inputs"]["nps"].update(records=records, parks=len(nps))
    matched = match_parks(spec, nps, drawable)
    national_pota = {pota for pota, _ in matched.values()}
    e = spec["base"].get("expect", {})
    old_national = {p["POTA"] for p, _ in drawable} & national_pota
    if "national_pota" in e:
        check(len(old_national) == e["national_pota"], f"旧版の国立公園が {len(old_national)} POTA(期待 {e['national_pota']})")

    features = retained(spec, nps, drawable, national_pota, proj, report)
    log(f"国定・県立等: {len(features)} geometry")
    if "other_pota" in e:
        n = len({p["POTA"] for p, _ in features})
        check(n == e["other_pota"], f"保持する国定・県立等が {n} POTA(期待 {e['other_pota']})")
    stopped = False
    for name in sorted(nps):
        pota, old = matched[name]
        out = national(spec, name, pota, old, nps[name], proj, strict, report, problems)
        log(f"{name}: {pota} {0 if out is None else len(out)} geometry")
        if out is None:
            stopped = True
            continue
        features.extend(out)
    report["estimated_parks"] = sorted(p["POTA"] for p in report["parks"] if p.get("unassigned_m2", 0) > spec["estimate"]["min_area_m2"])
    if stopped:
        report["stopped"] = "strict: 複数区分の公園に未割当・重複がある。problems.geojson を地図で確認すること"
        return None, report, problems

    features = [({**p, "UID": str(i)}, g) for i, (p, g) in enumerate(features, 1)]
    t, dropped = topo.encode(features)
    log(f"符号化: geometry {len(features)}、潰れた穴 {dropped}")
    report["output"] = stats(t, dropped)
    removal = spec.get("remove_after_generate")
    if removal:
        t = topo.remove_pota(t, removal["pota"])
        report["removed_after_generate"] = removal
        log(f"生成後に除いた POTA: {', '.join(removal['pota'])}")
    report["final"] = stats(t)
    return t, report, problems


def stats(t, dropped=None):
    geoms = t["objects"][topo.OBJECT]["geometries"]
    out = {
        "pota": len({g["properties"]["POTA"] for g in geoms}),
        "national_pota": len({g["properties"]["POTA"] for g in geoms if g["properties"]["NAME"].endswith("国立公園")}),
        "geometries": len(geoms),
        "polygons": sum(g["type"] == "Polygon" for g in geoms),
        "multipolygons": sum(g["type"] == "MultiPolygon" for g in geoms),
        "sha256": sha256(topo.dumps(t).encode("utf-8")),
    }
    if dropped is not None:
        out["dropped_holes"] = dropped
    return out


def compare_expect(spec, report):
    """仕様の期待値(件数)と出力の差。一致すれば空。

    ハッシュは参考値として一致したかだけを記録し、差には数えない。GEOS の演算の順序でリングの始点や
    部分の順が変わるとハッシュは変わるが、区域は同じでありうる。区域の比較は jaffpota.compare で行う。
    """
    got = {**report["output"], "estimated_parks": len(report["estimated_parks"])}
    diff = {k: {"expect": v, "got": got.get(k)} for k, v in spec.get("expect", {}).items() if got.get(k) != v}
    for k, v in spec.get("expect_final", {}).items():
        if report["final"].get(k) != v:
            diff[f"final.{k}"] = {"expect": v, "got": report["final"].get(k)}
    ref = spec.get("reference_sha256", {})
    report["reference_sha256_match"] = {
        "generated": ref.get("generated") == report["output"]["sha256"],
        "final": ref.get("final") == report["final"]["sha256"],
    }
    return diff


TOOL = Path(__file__).resolve().parent.parent


def default_base(spec):
    from .release import JSON_DIR
    return JSON_DIR / spec["base"]["file"]


def default_nps(spec):
    return TOOL / spec["nps"]["path"]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", type=Path)
    ap.add_argument("--base", type=Path, help="旧版の TopoJSON(既定: 共通アセットの仕様の旧版)")
    ap.add_argument("--nps", type=Path, help="環境省の国立公園 Shape ZIP(既定: 仕様の path)")
    ap.add_argument("--out", type=Path, required=True, help="出力ディレクトリ")
    ap.add_argument("--strict", action="store_true", help="未割当・重複があれば推定割当をせずに止める")
    a = ap.parse_args(argv)
    spec = json.loads(a.spec.read_text(encoding="utf-8"))
    base = a.base or default_base(spec)
    nps = a.nps or default_nps(spec)
    try:
        t, report, problems = build(spec, base.read_bytes(), nps.read_bytes(), strict=a.strict)
    except (SpecError, topo.CollapsedExterior) as e:
        print(f"生成できません: {e}", file=sys.stderr)
        return 2
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / "problems.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": problems}, ensure_ascii=False) + "\n", encoding="utf-8")
    if t is not None:
        (a.out / f"jaffpota-annotated-v{spec['version']}.json").write_text(topo.dumps(t), encoding="utf-8", newline="\n")
        report["differences_from_spec"] = compare_expect(spec, report)
    (a.out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if t is None:
        print(report["stopped"], file=sys.stderr)
        return 1
    print(json.dumps({"output": report["output"], "final": report["final"], "estimated_parks": report["estimated_parks"],
                      "differences_from_spec": report["differences_from_spec"],
                      "reference_sha256_match": report["reference_sha256_match"]}, ensure_ascii=False, indent=1))
    return 0 if not report["differences_from_spec"] else 3


if __name__ == "__main__":
    sys.exit(main())
