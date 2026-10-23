"""二つの公園区域 TopoJSON を、区域として比べる。

ハッシュはリングの始点や部分の順(GEOS の演算の順序で変わる)でも変わるため、再生成の確認にはこれを使う。
geometry を順に対応付け、UID 以外の属性の一致と、対称差(片方にしかない部分)の面積を EPSG:6933 で測る。

    uv run python -m jaffpota.compare a.json b.json [--max-m2 1] [--ignore-pota JP-0104]

geometry の数か属性が違えば、POTA ごとの面積の差を一覧にする(版の間の変化の確認にも使える)。
"""
import argparse
import json
import sys
from pathlib import Path

from . import topo
from .generate import Projector, polygonal, valid


def load(path, ignore):
    return [(p, g) for p, g in topo.decode(json.loads(Path(path).read_text(encoding="utf-8"))) if p.get("POTA") not in ignore]


def key(p):
    return {k: v for k, v in p.items() if k != "UID"}


def compare(a, b, proj=None):
    """geometry ごとに対応付けられれば (True, 行の一覧)、できなければ (False, POTA ごとの面積の差)。"""
    proj = proj or Projector()
    if len(a) == len(b) and all(key(pa) == key(pb) for (pa, _), (pb, _) in zip(a, b)):
        rows = []
        for (pa, ga), (_, gb) in zip(a, b):
            va, vb = valid(ga), valid(gb)
            rows.append({"UID": pa["UID"], "POTA": pa["POTA"], "JAFF": pa["JAFF"], "PID": pa["PID"], "NAME": pa["NAME"],
                         "symdiff_m2": proj.area(polygonal(va.symmetric_difference(vb))), "area_m2": proj.area(va)})
        return True, rows
    areas = {}
    for side, entries in (("a", a), ("b", b)):
        for p, g in entries:
            e = areas.setdefault(p["POTA"], {"POTA": p["POTA"], "NAME": p.get("NAME"), "a_m2": 0.0, "b_m2": 0.0, "a_geometries": 0, "b_geometries": 0})
            e[f"{side}_m2"] += proj.area(valid(g))
            e[f"{side}_geometries"] += 1
    return False, sorted(areas.values(), key=lambda e: -abs(e["a_m2"] - e["b_m2"]))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("a", type=Path)
    ap.add_argument("b", type=Path)
    ap.add_argument("--max-m2", type=float, default=1.0, help="対称差の合計の許容値(m²)")
    ap.add_argument("--ignore-pota", action="append", default=[], help="両方から除いて比べる POTA(繰り返し指定できる)")
    ap.add_argument("--top", type=int, default=10)
    a = ap.parse_args(argv)
    matched, rows = compare(load(a.a, set(a.ignore_pota)), load(a.b, set(a.ignore_pota)))
    if not matched:
        print("geometry の数か属性が違うため、POTA ごとの面積で比べます(a → b)")
        for e in rows[: a.top]:
            print(f"  {e['POTA']} {e['NAME']}: {e['a_m2']:.0f} → {e['b_m2']:.0f} m²  geometry {e['a_geometries']} → {e['b_geometries']}")
        return 1
    total = sum(r["symdiff_m2"] for r in rows)
    print(f"geometry {len(rows)}: 属性と順序は一致。対称差の合計 {total:.4f} m²(許容 {a.max_m2} m²)")
    for r in sorted(rows, key=lambda r: -r["symdiff_m2"])[: a.top]:
        if r["symdiff_m2"] > 0:
            print(f"  UID {r['UID']} {r['POTA']} {r['JAFF']}/{r['PID']} {r['NAME']}: {r['symdiff_m2']:.4f} m² / {r['area_m2']:.0f} m²")
    return 0 if total <= a.max_m2 else 1


if __name__ == "__main__":
    sys.exit(main())
