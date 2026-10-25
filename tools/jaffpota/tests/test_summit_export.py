"""summit_export: 下地の地図・input_rev・推定の CSV の行。小さな合成の図形で確かめる。"""
import csv
import io
import json
import tempfile
import time
import unittest
from pathlib import Path

from shapely.geometry import box, mapping

from jaffpota import summit_export as se
from jaffpota import summit_pairs as sp

# 経緯度 0.001 度は、約 100 m
LON0, LAT0 = 138.0, 35.0
ZONE = box(LON0, LAT0, LON0 + 0.001, LAT0 + 0.001)
SUMMIT = (LAT0 + 0.0005, LON0 + 0.0005)
MID = LON0 + 0.0005  # 市区町村 1(西)と 2(東)の境

MROW = {
    1: {"Pref": "県", "City": "A市", "JCG_text": ""},
    2: {"Pref": "県", "City": "B市", "JCG_text": ""},
}
KEY2MUNI = {"JCC#1": {1}, "JCC#2": {2}}


def make_geo(p1_west=LON0 - 0.5, far_muni_x=LON0 + 5.0):
    munis = {
        1: box(LON0 - 1, LAT0 - 1, MID, LAT0 + 1),
        2: box(MID, LAT0 - 1, LON0 + 1, LAT0 + 1),
        3: box(far_muni_x, LAT0 - 1, far_muni_x + 1, LAT0 + 1),  # 窓のはるか外
    }
    parks = {
        "P1": box(p1_west, LAT0 - 0.0005, LON0 + 0.0003, LAT0 + 0.0015),  # 西の市区町村を中心に
        "P2": box(LON0 + 0.0004, LAT0 - 0.0005, LON0 + 1, LAT0 + 0.0015),  # 東の市区町村と、西の市区町村に少しはみ出す
    }
    return se.Geo(parks, munis, KEY2MUNI, MROW)


PAIRS = [{"key": "JCC#1", "pota": "P1"}, {"key": "JCC#2", "pota": "P2"}, {"key": "JCC#1", "pota": "P2"}]
ESTIMATES = {"JCC#1|P1": "part", "JCC#2|P2": "all", "JCC#1|P2": "none"}
PARK_NAME = {"P1": "一の公園", "P2": "二の公園"}


def build(geo, pairs=PAIRS, estimates=ESTIMATES):
    return se.build_summit_map(geo, "JA/XX-001", SUMMIT[0], SUMMIT[1], mapping(ZONE), ["JCC#1", "JCC#2"],
                               pairs, estimates, "山", 1000, PARK_NAME)


def kinds(fc):
    out = {}
    for f in fc["features"]:
        out.setdefault(f["properties"]["kind"], []).append(f["properties"])
    return out


class TestBuildSummitMap(unittest.TestCase):
    def test_layers(self):
        fc, rev = build(make_geo())
        k = kinds(fc)
        self.assertEqual(fc["summit"], "JA/XX-001")
        self.assertEqual(len(k["zone"]), 1)
        self.assertEqual(len(k["summit"]), 1)
        self.assertEqual(sorted(p["key"] for p in k["area"]), ["JCC#1", "JCC#2"])
        # 判定用の層: 候補の公園の元の区域
        self.assertEqual(sorted(p["code"] for p in k["judge_park"]), ["P1", "P2"])
        self.assertTrue(rev.startswith(se.REV_PREFIX))
        self.assertEqual(len(rev), len(se.REV_PREFIX) + 16)

    def test_muni_pota_holds_only_all_and_part_estimates(self):
        fc, _ = build(make_geo())
        muni = {p["key"]: p for p in kinds(fc)["muni"]}
        self.assertEqual(muni["JCC#1"]["pota"], [{"code": "P1", "name": "一の公園", "coverage": "part"}])
        self.assertEqual(muni["JCC#2"]["pota"], [{"code": "P2", "name": "二の公園", "coverage": "all"}])
        self.assertEqual(muni["JCC#1"]["name"], "県A市")

    def test_park_layer_has_every_candidate_pair_not_only_part(self):
        # 目視で「一部」に変わった組も描けるように、none の組の区域も下地に入れる
        fc, _ = build(make_geo())
        parks = {(p["code"], p["key"]) for p in kinds(fc)["park"]}
        self.assertIn(("P1", "JCC#1"), parks)  # part
        self.assertIn(("P2", "JCC#2"), parks)  # all
        self.assertIn(("P2", "JCC#1"), parks)  # none

    def test_input_rev_is_stable(self):
        self.assertEqual(build(make_geo())[1], build(make_geo())[1])

    def test_input_rev_ignores_changes_outside_the_window(self):
        base = build(make_geo())[1]
        # 公園の遠い側の端、窓のはるか外の市区町村が変わっても、指紋は変わらない
        self.assertEqual(build(make_geo(p1_west=LON0 - 0.3))[1], base)
        self.assertEqual(build(make_geo(far_muni_x=LON0 + 3.0))[1], base)

    def test_input_rev_follows_changes_inside_the_window(self):
        base = build(make_geo())[1]
        # 窓の中にかかる公園の境界が動く
        self.assertNotEqual(build(make_geo(p1_west=LON0 - 0.0005))[1], base)
        # 候補の組が増える
        pairs = PAIRS + [{"key": "JCC#2", "pota": "P1"}]
        self.assertNotEqual(build(make_geo(), pairs=pairs, estimates={**ESTIMATES, "JCC#2|P1": "none"})[1], base)

    def test_input_rev_ignores_the_estimates(self):
        # 推定の答えが変わっても、入力ではない(入力が同じなら、目視は有効のまま)
        a = build(make_geo())[1]
        b = build(make_geo(), estimates={**ESTIMATES, "JCC#1|P1": "all"})[1]
        self.assertEqual(a, b)

    def test_summit_without_pairs_has_no_judge_layer(self):
        fc, _ = se.build_summit_map(make_geo(), "JA/XX-002", SUMMIT[0], SUMMIT[1], mapping(ZONE),
                                    ["JCC#1"], [], {}, "山", None, PARK_NAME)
        k = kinds(fc)
        self.assertNotIn("judge_park", k)
        self.assertNotIn("park", k)
        self.assertEqual(k["muni"][0]["pota"], [])


class TestGeo(unittest.TestCase):
    def test_key_names(self):
        geo = make_geo()
        self.assertEqual(geo.key_name("JCC#1"), "県A市")
        self.assertEqual(geo.key_name("JCC#999"), "")

    def test_jcg_name_has_the_county(self):
        geo = se.Geo({}, {1: ZONE}, {"JCG#1": {1}}, {1: {"Pref": "山梨県", "City": "富士河口湖町", "JCG_text": "南都留郡"}})
        self.assertEqual(geo.key_name("JCG#1"), "山梨県南都留郡富士河口湖町")

    def test_key_geom(self):
        geo = make_geo()
        self.assertIsNotNone(geo.key_geom("JCC#1"))
        self.assertIsNone(geo.key_geom("JCC#999"))
        self.assertEqual(geo.key_geom("N03#2").bounds, geo.munis[2].bounds)


def pair(key, pota, default, **kw):
    return {"key": key, "pota": pota, "px": 10, "tot": 100, "pct": 10.0, "dist": None, "noise": False,
            "shallow": False, "review": False, "default": default, **kw}


class TestEstimateRows(unittest.TestCase):
    META = {"input_rev": "r1-abc", "latitude": 35.0, "longitude": 138.0, "park_version": "p", "muni_version": "m",
            "munitable_version": "t", "reasons": "muni", "change_note": ""}

    def rows(self, summit, has_saved=False):
        return se.estimate_rows("JA/XX-001", summit, has_saved, lambda k: "名" + k, self.META)

    def summit(self, *pairs, **kw):
        return {"pairs": list(pairs), "split": False, "snap": False, **kw}

    def test_none_pairs_and_annotations_are_written(self):
        rows = self.rows(self.summit(pair("B", "P2", "none", dist=12.5, review=True), pair("A", "P1", "all", shallow=True)))
        # 市区町村、POTA の順
        self.assertEqual([(r["muni_key"], r["pota_code"], r["coverage"]) for r in rows],
                         [("A", "P1", "all"), ("B", "P2", "none")])
        self.assertEqual((rows[1]["dist_m"], rows[1]["needs_review"], rows[0]["shallow"]), (12.5, 1, 1))
        self.assertEqual((rows[0]["px"], rows[0]["tot_px"], rows[0]["pct"]), (10, 100, 10.0))
        self.assertEqual(rows[0]["muni_name"], "名A")

    def test_estimate_does_not_carry_the_verdict(self):
        # 判定表に保存された山頂は、データの答え。参考(hint)に、規則の答えを出す
        rows = self.rows(self.summit(pair("A", "P1", "all", pct=50.0)), has_saved=True)
        self.assertEqual((rows[0]["coverage"], rows[0]["hint"]), ("part", "all"))
        rows = self.rows(self.summit(pair("A", "P1", "all", pct=50.0)), has_saved=False)
        self.assertEqual((rows[0]["coverage"], rows[0]["hint"]), ("all", "part"))

    def test_rows_fit_the_csv_columns(self):
        rows = self.rows(self.summit(pair("A", "P1", "part"), pair("B", "P1", "none", noise=True), split=True))
        buf = io.StringIO()
        w = csv.DictWriter(buf, fieldnames=se.CSV_COLUMNS)
        w.writeheader()
        w.writerows(rows)
        back = list(csv.DictReader(io.StringIO(buf.getvalue())))
        self.assertEqual(list(back[0].keys()), se.CSV_COLUMNS)
        self.assertNotIn("verified", back[0])
        self.assertEqual(back[1]["noise"], "1")
        self.assertTrue(back[0]["note"].startswith("市区町村ごとに過半"))
        # 山頂の列は、同じ山頂のどの行でも同じ値
        self.assertEqual({r["input_rev"] for r in back}, {"r1-abc"})

    def test_importable_by_sotaapp2_rules(self):
        # sotaapp2 の取り込みの規則: coverage は all/part/none、真偽は 0/1、数は数
        rows = self.rows(self.summit(pair("A", "P1", "part", dist=3.0)))
        r = rows[0]
        self.assertIn(r["coverage"], sp.COVERAGES)
        for c in ("noise", "shallow", "needs_review"):
            self.assertIn(r[c], (0, 1))


# ---- 並列(fork したプロセスに渡す関数は、モジュールの関数) ----

_GEO = make_geo()  # fork 前に読み込み済み。子プロセスが共有する(読み取りだけ)


def _slow_upper(code):
    # 山頂の順と逆に待たせて、終わる順をばらばらにする
    time.sleep((int(code[1:]) % 7) * 0.002)
    return code.upper()


def _fail_at_7(code):
    if code == "s007":
        raise RuntimeError("s007: 図形が壊れている")
    return code


def _map_line(code):
    """合成の図形で、山頂の地図の 1 行と input_rev を作る(summit_export の 1 山頂ぶんと同じ計算)"""
    i = int(code[1:])
    pairs = PAIRS if i % 2 else PAIRS[:1]
    est = {k: v for k, v in ESTIMATES.items() if k in {f"{p['key']}|{p['pota']}" for p in pairs}}
    fc, rev = se.build_summit_map(_GEO, code, SUMMIT[0], SUMMIT[1], mapping(ZONE), ["JCC#1", "JCC#2"], pairs, est,
                                  f"山{i}", 1000 + i, PARK_NAME)
    return json.dumps(fc, ensure_ascii=False, separators=(",", ":")), rev


class TestMapResults(unittest.TestCase):
    codes = [f"s{i:03d}" for i in range(40)]

    def test_parallel_results_are_in_order_and_equal_to_serial(self):
        want = [c.upper() for c in self.codes]
        for jobs in (1, 2, 4, 8):
            self.assertEqual(list(se.map_results(self.codes, _slow_upper, jobs)), want, jobs)

    def test_parallel_map_lines_are_byte_identical_to_serial(self):
        serial = list(se.map_results(self.codes, _map_line, 1))
        for jobs in (2, 4):
            self.assertEqual(list(se.map_results(self.codes, _map_line, jobs)), serial, jobs)

    def test_a_failure_stops_the_run_and_names_the_summit(self):
        with self.assertRaises(RuntimeError) as cm:
            list(se.map_results(self.codes, _fail_at_7, 4))
        self.assertIn("s007", str(cm.exception))
        with self.assertRaises(RuntimeError):
            list(se.map_results(self.codes, _fail_at_7, 1))

    def test_small_inputs(self):
        self.assertEqual(list(se.map_results([], _slow_upper, 4)), [])
        self.assertEqual(list(se.map_results(["s001"], _slow_upper, 4)), ["S001"])

    def test_more_jobs_than_summits(self):
        self.assertEqual(list(se.map_results(["s001", "s002"], _slow_upper, 16)), ["S001", "S002"])


class TestFileVersion(unittest.TestCase):
    def test_version_follows_the_content(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "parks-v24.json"
            p.write_bytes(b"a")
            v1 = se.file_version(p)
            p.write_bytes(b"b")
            self.assertNotEqual(v1, se.file_version(p))
            self.assertTrue(v1.startswith("parks-v24-"))


if __name__ == "__main__":
    unittest.main()
