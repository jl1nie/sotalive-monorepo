"""固定版の入力から v23 を再生成し、配備中の v23 と区域として同じことを確かめる(30〜45 秒かかる)。

入力の国立公園 Shape は inputs/(仕様の path)にある。別の写しで試すときは JAFFPOTA_NPS_ZIP で指定する。
v24 は国土数値情報 A10 の GeoJSON(再配布できないので repo にない)を JAFFPOTA_A10 で渡したときだけ走る。

    uv run python -m unittest tests.test_reproduce -v
"""
import json
import os
import unittest
from pathlib import Path

from jaffpota import compare, generate, release, topo

TOOL = Path(__file__).resolve().parent.parent
SPEC = json.loads((TOOL / "specs/v23.json").read_text(encoding="utf-8"))
NPS = Path(os.environ.get("JAFFPOTA_NPS_ZIP") or generate.default_nps(SPEC))


@unittest.skipUnless(NPS.is_file(), f"国立公園 Shape がない({NPS})")
class TestReproduceV23(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spec = SPEC
        base = generate.default_base(SPEC).read_bytes()
        cls.t, cls.report, cls.problems = generate.build(cls.spec, base, NPS.read_bytes())

    def test_counts_match_spec(self):
        self.assertEqual(generate.compare_expect(self.spec, self.report), {})

    def test_same_areas_as_deployed(self):
        deployed = topo.decode(json.loads(release.path_of(23).read_text(encoding="utf-8")))
        matched, rows = compare.compare(topo.decode(self.t), deployed)
        self.assertTrue(matched, "geometry の数・属性・順序が配備中の v23 と違う")
        self.assertLess(sum(r["symdiff_m2"] for r in rows), 1.0)

    def test_problems_recorded(self):
        kinds = {(f["properties"]["POTA"], f["properties"]["kind"]) for f in self.problems}
        self.assertEqual({p for p, k in kinds if k == "unassigned"}, set(self.report["estimated_parks"]))
        self.assertEqual({p for p, k in kinds if k == "overlap"}, {"JP-0021"})  # 吉野熊野は旧区分どうしが重なる


if __name__ == "__main__":
    unittest.main()


SPEC24 = json.loads((TOOL / "specs/v24.json").read_text(encoding="utf-8"))
A10 = Path(os.environ["JAFFPOTA_A10"]) if os.environ.get("JAFFPOTA_A10") else None


@unittest.skipUnless(NPS.is_file() and A10 and A10.is_file(), "国立公園 Shape か A10(JAFFPOTA_A10)がない")
class TestReproduceV24(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base = generate.default_base(SPEC24).read_bytes()
        cls.t, cls.report, _ = generate.build(SPEC24, base, NPS.read_bytes(), a10_raw=A10.read_bytes())
        cls.display = generate.display_version(SPEC24, cls.t, cls.report)

    def test_counts_match_spec(self):
        self.assertEqual(generate.compare_expect(SPEC24, self.report), {})

    def test_display_is_committed_version(self):
        # 共通アセットに置いた v24 は、この表示用の版と同じ内容
        placed = release.path_of(24)
        if placed.is_file():
            self.assertEqual(generate.sha256(placed.read_bytes()), generate.sha256(topo.dumps(self.display).encode("utf-8")))

    def test_national_parts_same_as_v23(self):
        v23 = [(p, g) for p, g in topo.decode(json.loads(release.path_of(23).read_text(encoding="utf-8"))) if p["NAME"].endswith("国立公園")]
        v24 = [(p, g) for p, g in topo.decode(self.t) if p["NAME"].endswith("国立公園")]
        key = lambda e: (e[0]["POTA"], e[0]["JAFF"], e[0]["PID"])
        self.assertEqual(sorted(map(key, v23)), sorted(map(key, v24)))
        proj = generate.Projector()
        by = {key(e): e[1] for e in v23}
        self.assertLess(sum(proj.area(g.symmetric_difference(by[key((p, g))])) for p, g in v24), 10.0)

    def test_no_overlap_with_national(self):
        others = self.report["others"]
        self.assertEqual(sorted(others["dropped_pid"]), ["104", "110", "154", "215", "398", "399"])
        self.assertIn("JP-1405", others["national_overlap_removed_m2"])
