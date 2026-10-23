"""生成の規則(公園の対応付け・区分への割当・推定割当・差し引き・出力順)。合成データだけで動く。

固定版の入力での再現の確認は test_reproduce.py(入力のありかを環境変数で渡したときだけ走る)。
"""
import copy
import hashlib
import io
import json
import unittest
import zipfile

import shapefile
from shapely.geometry import Polygon, box

from jaffpota import generate, topo

PRJ = 'GEOGCS["GCS_JGD_2000",DATUM["D_JGD_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'


def nps_zip(records):
    """records は (NAME, ZONE, Polygon) の一覧。"""
    shp, shx, dbf = io.BytesIO(), io.BytesIO(), io.BytesIO()
    w = shapefile.Writer(shp=shp, shx=shx, dbf=dbf, shapeType=shapefile.POLYGON, encoding="utf-8")
    w.field("NAME", "C", 254)
    w.field("ZONE", "C", 254)
    for name, zone, poly in records:
        w.poly([list(reversed(poly.exterior.coords))])  # Shape の外周は時計回り
        w.record(name, zone)
    w.close()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for ext, b in (("shp", shp), ("shx", shx), ("dbf", dbf)):
            z.writestr(f"nps.{ext}", b.getvalue())
        z.writestr("nps.prj", PRJ)
    return buf.getvalue()


def base_topo(features):
    t, _ = topo.encode([({**p, "UID": str(i)}, g) for i, (p, g) in enumerate(features, 1)])
    t["objects"]["jaffpota"]["geometries"].append({"type": None, "properties": {"UID": "null"}})
    return topo.dumps(t).encode("utf-8")


def props(pota, jaff, pid, name):
    return {"JAFF": jaff, "NAME": name, "PID": pid, "POTA": pota}


# 経度 0.01 度 ≒ 1 km。テスト国立公園は旧版で A(西)と B(東)の二区分
OLD = [
    (props("JP-0500", "JAFF-0500", "500", "県立公園"), box(140.00, 36.00, 140.01, 36.01)),
    (props("JP-0010", "JAFF-0010", "010", "テスト国立公園"), box(140.10, 36.00, 140.11, 36.01)),
    (props("JP-0010", "JAFF-0011", "011", "テスト国立公園"), box(140.11, 36.00, 140.12, 36.01)),
    (props("JP-0156", "JAFF-0088", "155", "海岸国定公園"), box(141.00, 36.00, 141.02, 36.01)),
    (props("JP-0156", "JAFF-0088", "155", "海岸国定公園"), box(141.10, 36.00, 141.11, 36.01)),
    (props("JP-0400", "JAFF-0400", "400", "単一国立公園"), box(142.00, 36.00, 142.01, 36.01)),
]
# 新区域: テストは東へ広がり(未割当 → 近い B へ)、新規はJP-0156 の東半分と 2 番目の図形の全体を覆う
NPS = [
    ("テスト", "第1種特別地域", box(140.10, 36.00, 140.12, 36.01)),
    ("テスト", "普通地域", box(140.125, 36.00, 140.13, 36.01)),
    ("新規", "特別保護地区", box(141.01, 35.99, 141.03, 36.02)),
    ("新規", "普通地域", box(141.095, 35.99, 141.115, 36.02)),
    ("単一", "普通地域", box(142.00, 36.00, 142.02, 36.01)),
]
SPEC = {
    "version": 99,
    "base": {"file": "base.json", "sha256": None, "expect": {"null_geometries": 1, "pota": 4, "national_pota": 2, "other_pota": 2}},
    "nps": {"source": "test", "published": "2000-01-01", "sha256": None, "encoding": "utf-8", "crs": "EPSG:4612",
            "expect": {"records": 5, "parks": 3}},
    "national_suffix": "国立公園",
    "new_parks": {"新規": {"POTA": "JP-0032", "JAFF": "JAFF-0097", "PID": "032"}},
    "subtract": [{"from": "JP-0156", "parks": ["新規"], "buffer_m": 0.1}],
    "estimate": {"tie_buffer_m": 10, "distance_decimals": 6, "min_area_m2": 1},
    "expect": {},
}


def dominant(estimated):
    """推定割当の面積の大半を受けた区分。境界の量子化の差で出る細片(1 m² 未満)は無視する。"""
    big = [k for k, v in estimated.items() if v > 1]
    assert len(big) == 1, estimated
    return big[0]


def run(old=OLD, nps=NPS, spec=SPEC, strict=False):
    base, z = base_topo(old), nps_zip(nps)
    spec = copy.deepcopy(spec)
    spec["base"]["sha256"] = hashlib.sha256(base).hexdigest()
    spec["nps"]["sha256"] = hashlib.sha256(z).hexdigest()
    return generate.build(spec, base, z, strict=strict)


class TestBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t, cls.report, cls.problems = run()
        cls.out = topo.decode(cls.t)
        cls.proj = generate.Projector()

    def test_order_and_uid(self):
        got = [(p["POTA"], p["JAFF"], p["PID"]) for p, _ in self.out]
        self.assertEqual(got, [
            ("JP-0156", "JAFF-0088", "155"),  # 保持は POTA 順。2 番目の図形は差し引きで消える
            ("JP-0500", "JAFF-0500", "500"),
            ("JP-0010", "JAFF-0010", "010"),  # 国立公園は公園名の文字コード順(テスト < 単一 < 新規)、区分は (JAFF, PID) 順
            ("JP-0010", "JAFF-0011", "011"),
            ("JP-0400", "JAFF-0400", "400"),
            ("JP-0032", "JAFF-0097", "032"),
        ])
        self.assertEqual([p["UID"] for p, _ in self.out], [str(i) for i in range(1, len(self.out) + 1)])

    def test_national_names_and_new_park(self):
        new = [(p, g) for p, g in self.out if p["POTA"] == "JP-0032"]
        self.assertEqual(len(new), 1)
        self.assertEqual(new[0][0], {"JAFF": "JAFF-0097", "NAME": "新規国立公園", "PID": "032", "POTA": "JP-0032", "UID": new[0][0]["UID"]})

    def test_single_combo_takes_whole_area(self):
        (p, g), = [(p, g) for p, g in self.out if p["POTA"] == "JP-0400"]
        self.assertEqual(p["NAME"], "単一国立公園")
        self.assertAlmostEqual(g.area, box(142.00, 36.00, 142.02, 36.01).area, places=9)

    def test_unassigned_goes_to_nearest_combo(self):
        parts = {p["JAFF"]: g for p, g in self.out if p["POTA"] == "JP-0010"}
        self.assertAlmostEqual(parts["JAFF-0010"].area, box(140.10, 36.00, 140.11, 36.01).area, places=9)
        self.assertAlmostEqual(parts["JAFF-0011"].area, box(140.11, 36.00, 140.12, 36.01).area + box(140.125, 36.00, 140.13, 36.01).area, places=9)
        park = next(e for e in self.report["parks"] if e["POTA"] == "JP-0010")
        self.assertGreater(park["unassigned_m2"], 1)
        self.assertEqual(dominant(park["estimated_m2"]), "JAFF-0011/011")
        self.assertEqual(self.report["estimated_parks"], ["JP-0010"])
        self.assertEqual([f["properties"]["kind"] for f in self.problems], ["unassigned"])

    def test_subtract_from_retained(self):
        kept = [g for p, g in self.out if p["POTA"] == "JP-0156"]
        self.assertEqual(len(kept), 1)
        new = next(g for p, g in self.out if p["POTA"] == "JP-0032")
        self.assertLess(self.proj.area(kept[0].intersection(new)), 0.5)
        self.assertEqual(self.report["subtracted"]["JP-0156"]["dropped_geometries"], 1)

    def test_output_counts(self):
        self.assertEqual(self.report["output"]["pota"], 5)
        self.assertEqual(self.report["output"]["geometries"], len(self.out))


class TestRules(unittest.TestCase):
    def test_strict_stops_on_unassigned(self):
        t, report, problems = run(strict=True)
        self.assertIsNone(t)
        self.assertIn("stopped", report)
        self.assertEqual(problems[0]["properties"]["POTA"], "JP-0010")

    def test_overlap_reported_and_first_combo_wins(self):
        old = list(OLD)
        old[2] = (old[2][0], box(140.105, 36.00, 140.12, 36.01))  # B が A に食い込む
        nps = [r for r in NPS if r[0] != "テスト"] + [("テスト", "普通地域", box(140.10, 36.00, 140.12, 36.01))]
        spec = copy.deepcopy(SPEC)
        spec["nps"]["expect"]["records"] = 4
        t, report, problems = run(old=old, nps=nps, spec=spec)
        parts = {p["JAFF"]: g for p, g in topo.decode(t) if p["POTA"] == "JP-0010"}
        self.assertAlmostEqual(parts["JAFF-0010"].area, box(140.10, 36.00, 140.11, 36.01).area, places=9)
        self.assertAlmostEqual(parts["JAFF-0011"].area, box(140.11, 36.00, 140.12, 36.01).area, places=9)
        self.assertEqual([f["properties"]["kind"] for f in problems], ["overlap"])

    def test_tie_broken_by_buffer_intersection(self):
        # 未割当の断片が A・B の両方に接する(距離 0)。10 m 広げた範囲との交差が大きい B へ
        old = list(OLD)
        old[1] = (old[1][0], box(140.10, 36.00, 140.11, 36.01))
        old[2] = (old[2][0], box(140.11, 36.00, 140.12, 36.01))
        gap = Polygon([(140.1095, 36.01), (140.12, 36.01), (140.12, 36.011), (140.1095, 36.011)])
        nps = [r for r in NPS if r[0] != "テスト"] + [("テスト", "普通地域", box(140.10, 36.00, 140.12, 36.01).union(gap))]
        spec = copy.deepcopy(SPEC)
        spec["nps"]["expect"]["records"] = 4
        _, report, _ = run(old=old, nps=nps, spec=spec)
        park = next(e for e in report["parks"] if e["POTA"] == "JP-0010")
        self.assertEqual(dominant(park["estimated_m2"]), "JAFF-0011/011")

    def test_hash_mismatch_refused(self):
        base, z = base_topo(OLD), nps_zip(NPS)
        spec = copy.deepcopy(SPEC)
        spec["base"]["sha256"] = "0" * 64
        spec["nps"]["sha256"] = hashlib.sha256(z).hexdigest()
        with self.assertRaisesRegex(generate.SpecError, "旧版のハッシュ"):
            generate.build(spec, base, z)

    def test_unknown_park_refused(self):
        nps = NPS + [("謎", "普通地域", box(143.0, 36.0, 143.01, 36.01))]
        spec = copy.deepcopy(SPEC)
        spec["nps"]["expect"] = {"records": 6, "parks": 4}
        with self.assertRaisesRegex(generate.SpecError, "謎: 旧版にも新規の表にもない"):
            run(nps=nps, spec=spec)


# ---- v24 以降: 国定・県立等を A10 の原形から作り、国立公園は旧版の区分をそのまま引き継ぐ ----

def a10_geojson(features):
    """features は (PID, 区分 A10_003, Polygon) の一覧。"""
    return json.dumps({
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::4612"}},
        "features": [{"type": "Feature", "properties": {"A10_003": cat, "A10_005": pid},
                      "geometry": {"type": "MultiPolygon", "coordinates": [[list(map(list, poly.exterior.coords))]]}}
                     for pid, cat, poly in features],
    }).encode("utf-8")


A10_OLD = [
    (props("JP-0500", "JAFF-0500", "500", "県立公園"), box(140.00, 36.00, 140.01, 36.01)),
    (props("JP-0010", "JAFF-0010", "010", "テスト国立公園"), box(140.10, 36.00, 140.11, 36.01)),
    (props("JP-0010", "JAFF-0011", "011", "テスト国立公園"), box(140.11, 36.00, 140.12, 36.01)),
    (props("JP-0600", "JAFF-0600", "600", "国定公園"), box(140.125, 36.00, 140.14, 36.01)),
    (props("JP-0800", "JAFF-0800", "800", "形なし県立公園"), box(140.50, 36.00, 140.51, 36.01)),
]
A10_NPS = [("テスト", "普通地域", box(140.10, 36.00, 140.12, 36.01))]
A10 = [
    ("500", "3", box(140.00, 36.00, 140.0105, 36.01)),   # 旧版と重なる → JP-0500。形は原形
    ("500", "3", box(140.02, 36.00, 140.021, 36.001)),   # 旧版で消えた小島 → 同じ PID の最も近い JP-0500
    ("600", "2", box(140.115, 36.00, 140.14, 36.01)),    # 国立公園と重なる部分(140.115〜140.12)は差し引く
    ("700", "3", box(141.00, 36.00, 141.01, 36.01)),     # 旧版にない PID → 除く
    ("010", "1", box(140.10, 36.00, 140.12, 36.02)),     # A10 の国立公園は使わない
]
A10_SPEC = {
    "version": 98,
    "base": {"file": "base.json", "sha256": None, "expect": {"null_geometries": 1, "pota": 4, "national_pota": 1, "other_pota": 3}},
    "nps": {"source": "test", "published": "2000-01-01", "sha256": None, "encoding": "utf-8", "crs": "EPSG:4612",
            "expect": {"records": 1, "parks": 1}},
    "others": {"source": "a10", "source_note": "test", "sha256": None, "crs": "EPSG:4612", "subtract_buffer_m": 0.1,
               "expect": {"records": 5}},
    "national_suffix": "国立公園",
    "national_from_base": True,
    "drop_parts_below_m2": 1,
    "new_parks": {},
    "subtract": [],
    "estimate": {"tie_buffer_m": 10, "distance_decimals": 6, "min_area_m2": 1},
    "expect": {},
}


def run_a10(a10=A10, spec=A10_SPEC, with_a10=True):
    base, z, g = base_topo(A10_OLD), nps_zip(A10_NPS), a10_geojson(a10)
    spec = copy.deepcopy(spec)
    spec["base"]["sha256"] = hashlib.sha256(base).hexdigest()
    spec["nps"]["sha256"] = hashlib.sha256(z).hexdigest()
    spec["others"]["sha256"] = hashlib.sha256(g).hexdigest()
    return generate.build(spec, base, z, a10_raw=g if with_a10 else None)


class TestBuildFromA10(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t, cls.report, cls.problems = run_a10()
        cls.out = topo.decode(cls.t)
        cls.proj = generate.Projector()

    def test_order(self):
        self.assertEqual([(p["POTA"], p["JAFF"]) for p, _ in self.out], [
            ("JP-0500", "JAFF-0500"), ("JP-0600", "JAFF-0600"), ("JP-0800", "JAFF-0800"),
            ("JP-0010", "JAFF-0010"), ("JP-0010", "JAFF-0011"),
        ])

    def test_shape_from_a10_and_islet_merged(self):
        (g,) = [g for p, g in self.out if p["POTA"] == "JP-0500"]
        want = box(140.00, 36.00, 140.0105, 36.01).union(box(140.02, 36.00, 140.021, 36.001))
        self.assertLess(self.proj.area(g.symmetric_difference(want)), 1)
        self.assertEqual(self.report["others"]["assigned"], {"overlap": 2, "nearest": 1})

    def test_national_overlap_subtracted(self):
        (g,) = [g for p, g in self.out if p["POTA"] == "JP-0600"]
        self.assertLess(self.proj.area(g.symmetric_difference(box(140.12, 36.00, 140.14, 36.01))), 200)  # 0.1 m の緩衝の分だけ違う
        self.assertGreater(self.report["others"]["national_overlap_removed_m2"]["JP-0600"], 400_000)

    def test_unknown_pid_dropped_and_base_kept_when_no_a10(self):
        self.assertEqual(self.report["others"]["dropped_pid"], {"700": 1})
        self.assertEqual(self.report["others"]["kept_base_shape"], ["JP-0800"])

    def test_national_parts_taken_from_base(self):
        parts = {p["JAFF"]: g for p, g in self.out if p["POTA"] == "JP-0010"}
        self.assertLess(self.proj.area(parts["JAFF-0010"].symmetric_difference(box(140.10, 36.00, 140.11, 36.01))), 1)  # 量子化 2 回分
        self.assertLess(self.proj.area(parts["JAFF-0011"].symmetric_difference(box(140.11, 36.00, 140.12, 36.01))), 1)

    def test_a10_required(self):
        with self.assertRaisesRegex(generate.SpecError, "A10"):
            run_a10(with_a10=False)

    def test_a10_hash_checked(self):
        spec = copy.deepcopy(A10_SPEC)
        base, z, g = base_topo(A10_OLD), nps_zip(A10_NPS), a10_geojson(A10)
        spec["base"]["sha256"] = hashlib.sha256(base).hexdigest()
        spec["nps"]["sha256"] = hashlib.sha256(z).hexdigest()
        spec["others"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(generate.SpecError, "A10 のハッシュ"):
            generate.build(spec, base, z, a10_raw=g)

    def test_tiny_parts_dropped_before_encoding(self):
        sliver = Polygon([(140.03, 36.00), (140.03000001, 36.00), (140.03, 36.00000001)])
        _, report, _ = run_a10(a10=A10 + [("500", "3", sliver)], spec={**A10_SPEC, "others": {**A10_SPEC["others"], "expect": {"records": 6}}})
        self.assertEqual(report["dropped_tiny_parts"]["parts"], 1)


if __name__ == "__main__":
    unittest.main()
