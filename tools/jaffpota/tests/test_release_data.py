"""配備する最新版 jaffpota-annotated-vN.json の検証。

版に依存しない検査(書式・属性・UID・arc・参照・DB 照合)と、v23 以降の検査(件数・新規公園・除いた公園)に分かれる。

    uv run python -m unittest tests.test_release_data -v
    JAFFPOTA_API=https://sotaapp2.sotalive.net uv run python -m unittest tests.test_release_data -v   # DB 照合も実行
"""
import json
import os
import unittest
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from jaffpota import patch
from jaffpota import release as rel
from jaffpota import topo

PATH = rel.latest_path()
VERSION = rel.latest_version()
V23_OR_LATER = VERSION >= 23
GEOMETRIES = {23: 1439, 24: 416}  # v24 は同じ公園の地物を 1 つにまとめた
PROPS = ["JAFF", "NAME", "PID", "POTA", "UID"]
NEW_PARKS = {
    "JP-0030": ("JAFF-0090", "030", "屋久島国立公園"),
    "JP-0032": ("JAFF-0097", "032", "やんばる国立公園"),
    "JP-0033": ("JAFF-0092", "033", "慶良間諸島国立公園"),
}
REMOVED = {"JP-0104"}  # 日高山脈襟裳国定公園: 日高山脈襟裳十勝国立公園(JP-2107)へ格上げ、DB でも inactive


def polygons(g):
    return [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]


class TestLatest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = PATH.read_text(encoding="utf-8")
        cls.d = json.loads(cls.raw)
        cls.geoms = cls.d["objects"][topo.OBJECT]["geometries"]

    def test_format(self):
        self.assertEqual(self.d["type"], "Topology")
        self.assertEqual(list(self.d["objects"]), [topo.OBJECT])
        self.assertEqual(self.d["objects"][topo.OBJECT]["type"], "GeometryCollection")
        self.assertEqual(topo.dumps(self.d), self.raw)  # 空白なし・非 ASCII のエスケープなし・末尾の改行 1 個

    def test_properties(self):
        for g in self.geoms:
            self.assertIn(g["type"], ("Polygon", "MultiPolygon"))
            self.assertEqual(sorted(g["properties"]), PROPS)
            for k in PROPS:
                v = g["properties"][k]
                self.assertIsInstance(v, str)
                self.assertTrue(v, f"{k} が空: {g['properties']}")

    def test_uid_sequential(self):
        self.assertEqual([g["properties"]["UID"] for g in self.geoms], [str(i) for i in range(1, len(self.geoms) + 1)])

    def test_arcs_valid_and_all_used(self):
        n = len(self.d["arcs"])
        used = set()
        for g in self.geoms:
            for poly in polygons(g):
                self.assertTrue(poly, g["properties"])
                for ring in poly:
                    self.assertTrue(ring)
                    for i in ring:
                        j = i if i >= 0 else ~i
                        self.assertLess(j, n)
                        used.add(j)
        self.assertEqual(len(used), n, "未参照の arc がある")
        for a in self.d["arcs"]:
            self.assertGreaterEqual(len(a), 4)  # 閉じたリングは 4 点以上

    def test_references_latest(self):
        for ref in rel.REFERENCES:
            self.assertEqual(rel.referenced_versions(ref), {rel.latest_version()}, f"{ref} の参照が最新版とずれている")

    @unittest.skipUnless(VERSION in GEOMETRIES, "件数を決めていない版")
    def test_counts(self):
        self.assertEqual(len(self.geoms), GEOMETRIES[VERSION])
        pota = {g["properties"]["POTA"] for g in self.geoms}
        self.assertEqual(len(pota), 395)
        national = {g["properties"]["POTA"] for g in self.geoms if g["properties"]["NAME"].endswith("国立公園")}
        self.assertEqual(len(national), 35)

    @unittest.skipUnless(V23_OR_LATER, "v23 以降の検査")
    def test_new_national_parks(self):
        for pota, (jaff, pid, name) in NEW_PARKS.items():
            gs = [g["properties"] for g in self.geoms if g["properties"]["POTA"] == pota]
            self.assertTrue(gs, pota)
            for p in gs:
                self.assertEqual((p["JAFF"], p["PID"], p["NAME"]), (jaff, pid, name))
        self.assertTrue(any(g["properties"]["POTA"] == "JP-0029" for g in self.geoms))  # 霧島錦江湾と屋久島は別の公園

    @unittest.skipUnless(V23_OR_LATER, "v23 以降の検査")
    def test_removed_pota_absent(self):
        present = {g["properties"]["POTA"] for g in self.geoms}
        self.assertFalse(present & REMOVED)
        self.assertIn("JP-2107", present)

    @unittest.skipUnless(os.environ.get("JAFFPOTA_API"), "JAFFPOTA_API 未設定のため DB 照合をスキップ")
    def test_pota_codes_active_in_db(self):
        api = os.environ["JAFFPOTA_API"].rstrip("/")
        codes = sorted({g["properties"]["POTA"] for g in self.geoms})

        def get(code):
            url = f"{api}/api/v2/pota/parks/{urllib.parse.quote(code)}"
            try:
                with urllib.request.urlopen(patch.api_request(url), timeout=15) as r:
                    return code, json.loads(r.read())
            except urllib.error.HTTPError as e:
                return code, e.code

        # 本番の sotaapp2(shared-cpu-1x)に負荷をかけすぎないよう、並列は 2 にする
        with ThreadPoolExecutor(2) as ex:
            res = dict(ex.map(get, codes))
        missing = [c for c, v in res.items() if not isinstance(v, dict)]
        inactive = [c for c, v in res.items() if isinstance(v, dict) and v.get("parkInactive")]
        self.assertEqual(missing, [], "DB に存在しない POTA")
        self.assertEqual(inactive, [], "DB で inactive の POTA")


if __name__ == "__main__":
    unittest.main()
