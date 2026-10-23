"""固定版の入力から v23 を再生成し、配備中の v23 と区域として同じことを確かめる(30〜45 秒かかる)。

入力の国立公園 Shape は inputs/(仕様の path)にある。別の写しで試すときは JAFFPOTA_NPS_ZIP で指定する。

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
