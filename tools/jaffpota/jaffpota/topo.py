"""公園区域 TopoJSON の復号と符号化。

復号は TopoJSON の一般形(transform による量子化、差分符号化された arcs、負の番号による逆向きの参照、
複数の arc をつないだリング)を扱う。符号化は MyACT 向けの固定形で、全座標の最小・最大から
各軸を 999999999 等分に量子化し、リングごとに独立した arc を作る(共有 arc の最適化はしない)。
"""
import json

import numpy as np
from shapely.geometry import MultiPolygon, Polygon

OBJECT = "jaffpota"
QUANTIZATION = 999999999


def decode_arcs(topo):
    t = topo.get("transform")
    arcs = []
    for a in topo["arcs"]:
        a = np.asarray(a, dtype=np.float64)
        if t:
            a = np.cumsum(a, axis=0) * t["scale"] + t["translate"]
        arcs.append(a)
    return arcs


def ring_coords(ids, arcs):
    pts = []
    for i in ids:
        a = arcs[i] if i >= 0 else arcs[~i][::-1]
        pts.append(a if not pts else a[1:])
    return np.concatenate(pts)


def geometry_of(g, arcs):
    """TopoJSON の geometry を shapely にする。type:null や空図形は None。座標とリングの向きは変えない。"""
    if g.get("type") == "Polygon":
        polys = [g["arcs"]]
    elif g.get("type") == "MultiPolygon":
        polys = g["arcs"]
    else:
        return None
    parts = [Polygon(ring_coords(p[0], arcs), [ring_coords(r, arcs) for r in p[1:]]) for p in polys if p]
    if not parts:
        return None
    return parts[0] if g["type"] == "Polygon" else MultiPolygon(parts)


def decode(topo):
    """(properties, geometry) の一覧を元の順序で返す。描画できない geometry の geometry は None。"""
    arcs = decode_arcs(topo)
    return [(dict(g.get("properties") or {}), geometry_of(g, arcs)) for g in topo["objects"][OBJECT]["geometries"]]


def polygons_of(geom):
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    raise ValueError(f"Polygon/MultiPolygon 以外の図形: {geom.geom_type}")


def _dedupe(q):
    keep = np.ones(len(q), dtype=bool)
    keep[1:] = np.any(q[1:] != q[:-1], axis=1)
    return q[keep]


class CollapsedExterior(ValueError):
    pass


def encode(features):
    """features は (properties, Polygon|MultiPolygon) の一覧。(topology, 潰れて除いた穴の数) を返す。

    UID は呼び出し側で振る。properties の鍵は辞書順に並べる。
    """
    rings = [np.asarray(r.coords, dtype=np.float64) for _, g in features for p in polygons_of(g) for r in (p.exterior, *p.interiors)]
    allpts = np.concatenate(rings)
    lo, hi = allpts.min(axis=0), allpts.max(axis=0)
    scale = (hi - lo) / QUANTIZATION
    arcs, geometries, dropped = [], [], 0

    def ring_arc(coords):
        q = _dedupe(np.round((np.asarray(coords, dtype=np.float64) - lo) / scale).astype(np.int64))
        if len(q) < 4:
            return None
        arcs.append(np.concatenate([q[:1], np.diff(q, axis=0)]).tolist())
        return [len(arcs) - 1]

    for props, g in features:
        polys = []
        for p in polygons_of(g):
            ext = ring_arc(p.exterior.coords)
            if ext is None:
                raise CollapsedExterior(f"外周が量子化で潰れた: {props}")
            holes = []
            for r in p.interiors:
                h = ring_arc(r.coords)
                if h is None:
                    dropped += 1
                else:
                    holes.append(h)
            polys.append([ext, *holes])
        geometries.append({
            "type": "Polygon" if isinstance(g, Polygon) else "MultiPolygon",
            "arcs": polys[0] if isinstance(g, Polygon) else polys,
            "properties": {k: props[k] for k in sorted(props)},
        })
    topo = {
        "type": "Topology",
        "objects": {OBJECT: {"type": "GeometryCollection", "geometries": geometries}},
        "arcs": arcs,
        "transform": {"scale": scale.tolist(), "translate": lo.tolist()},
    }
    return topo, dropped


def remove_pota(topo, pota):
    """指定の POTA の geometry を除いた新しい topology を返す。transform は変えない。

    除いた geometry だけが使う arc を消して番号を詰め、UID を 1 から振り直す。
    """
    pota = set(pota)
    geoms = [g for g in topo["objects"][OBJECT]["geometries"] if g["properties"]["POTA"] not in pota]

    def polys(g):
        return [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]

    used = sorted({i if i >= 0 else ~i for g in geoms for p in polys(g) for r in p for i in r})
    renum = {old: new for new, old in enumerate(used)}

    def remap(i):
        return renum[i] if i >= 0 else ~renum[~i]

    out = []
    for n, g in enumerate(geoms, 1):
        ps = [[[remap(i) for i in r] for r in p] for p in polys(g)]
        out.append({"type": g["type"], "arcs": ps[0] if g["type"] == "Polygon" else ps,
                    "properties": {**g["properties"], "UID": str(n)}})
    return {
        "type": "Topology",
        "objects": {OBJECT: {"type": "GeometryCollection", "geometries": out}},
        "arcs": [topo["arcs"][i] for i in used],
        "transform": topo["transform"],
    }


def dumps(topo):
    """UTF-8、空白なし、非 ASCII をエスケープしない JSON と末尾の改行 1 個。"""
    return json.dumps(topo, ensure_ascii=False, separators=(",", ":")) + "\n"
