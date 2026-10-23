"""TopoJSON の符号化・復号。合成データだけで動く。"""
import json
import unittest

from shapely.geometry import MultiPolygon, Polygon

from jaffpota import topo


def square(x, y, d, holes=()):
    return Polygon([(x, y), (x + d, y), (x + d, y + d), (x, y + d), (x, y)], holes)


class TestEncode(unittest.TestCase):
    def test_round_trip(self):
        features = [
            ({"POTA": "JP-0001", "UID": "1"}, square(135.0, 35.0, 0.1)),
            ({"POTA": "JP-0002", "UID": "2"}, MultiPolygon([square(136.0, 36.0, 0.1), square(136.5, 36.0, 0.1)])),
        ]
        t, dropped = topo.encode(features)
        self.assertEqual(dropped, 0)
        self.assertEqual(list(t), ["type", "objects", "arcs", "transform"])
        geoms = t["objects"]["jaffpota"]["geometries"]
        self.assertEqual([g["type"] for g in geoms], ["Polygon", "MultiPolygon"])
        self.assertEqual(geoms[0]["arcs"], [[0]])
        self.assertEqual(geoms[1]["arcs"], [[[1]], [[2]]])
        back = topo.decode(json.loads(topo.dumps(t)))
        for (p0, g0), (p1, g1) in zip(features, back):
            self.assertEqual(p0, p1)
            self.assertTrue(g0.equals_exact(g1, 1e-7))

    def test_quantization_spans_bbox(self):
        t, _ = topo.encode([({"UID": "1"}, square(130.0, 30.0, 10.0))])
        self.assertEqual(t["transform"]["translate"], [130.0, 30.0])
        first = t["arcs"][0]
        self.assertEqual(first[0], [0, 0])
        xs = [sum(d[0] for d in first[: i + 1]) for i in range(len(first))]
        self.assertEqual(max(xs), topo.QUANTIZATION)

    def test_properties_sorted(self):
        t, _ = topo.encode([({"UID": "1", "JAFF": "J", "POTA": "P"}, square(0, 0, 1))])
        self.assertEqual(list(t["objects"]["jaffpota"]["geometries"][0]["properties"]), ["JAFF", "POTA", "UID"])

    def test_tiny_hole_dropped_and_counted(self):
        # 量子化の刻みより小さい穴は連続重複点の除去で潰れる
        hole = [(1.0, 1.0), (1.0 + 1e-12, 1.0), (1.0, 1.0 + 1e-12), (1.0, 1.0)]
        t, dropped = topo.encode([({"UID": "1"}, square(0.0, 0.0, 10.0, [hole]))])
        self.assertEqual(dropped, 1)
        self.assertEqual(t["objects"]["jaffpota"]["geometries"][0]["arcs"], [[0]])

    def test_collapsed_exterior_raises(self):
        tiny = Polygon([(5.0, 5.0), (5.0 + 1e-12, 5.0), (5.0, 5.0 + 1e-12), (5.0, 5.0)])
        with self.assertRaises(topo.CollapsedExterior):
            topo.encode([({"UID": "1"}, square(0.0, 0.0, 10.0)), ({"UID": "2"}, tiny)])

    def test_dumps_format(self):
        t, _ = topo.encode([({"NAME": "国立公園", "UID": "1"}, square(0, 0, 1))])
        s = topo.dumps(t)
        self.assertTrue(s.endswith("}\n") and not s.endswith("\n\n"))
        self.assertIn("国立公園", s)
        self.assertNotIn(" ", s)


class TestRemovePota(unittest.TestCase):
    def test_removes_geometry_arcs_and_renumbers(self):
        features = [
            ({"POTA": "JP-0001", "UID": "1"}, square(135.0, 35.0, 0.1)),
            ({"POTA": "JP-0002", "UID": "2"}, MultiPolygon([square(136.0, 36.0, 0.1), square(136.5, 36.0, 0.1)])),
            ({"POTA": "JP-0003", "UID": "3"}, square(137.0, 37.0, 0.1, [[(137.02, 37.02), (137.05, 37.02), (137.05, 37.05), (137.02, 37.02)]])),
        ]
        t, _ = topo.encode(features)
        r = topo.remove_pota(t, ["JP-0002"])
        self.assertEqual(r["transform"], t["transform"])
        geoms = r["objects"]["jaffpota"]["geometries"]
        self.assertEqual([(g["properties"]["POTA"], g["properties"]["UID"]) for g in geoms], [("JP-0001", "1"), ("JP-0003", "2")])
        self.assertEqual(geoms[1]["arcs"], [[1], [2]])
        self.assertEqual(r["arcs"], [t["arcs"][0], t["arcs"][3], t["arcs"][4]])
        kept = topo.decode(r)
        self.assertTrue(kept[1][1].equals_exact(topo.decode(t)[2][1], 0))


class TestDecode(unittest.TestCase):
    def test_shared_and_reversed_arcs_and_null(self):
        # 二つの正方形が辺を共有する、量子化なしの TopoJSON
        t = {
            "type": "Topology",
            "arcs": [
                [[1, 0], [1, 1]],
                [[1, 1], [0, 1], [0, 0], [1, 0]],
                [[1, 0], [2, 0], [2, 1], [1, 1]],
            ],
            "objects": {"jaffpota": {"type": "GeometryCollection", "geometries": [
                {"type": "Polygon", "arcs": [[0, 1]], "properties": {"UID": "1"}},
                {"type": None, "properties": {"UID": "x"}},
                {"type": "Polygon", "arcs": [[2, -1]], "properties": {"UID": "2"}},
            ]}},
        }
        out = topo.decode(t)
        self.assertEqual([p["UID"] for p, _ in out], ["1", "x", "2"])
        self.assertIsNone(out[1][1])
        self.assertAlmostEqual(out[0][1].area, 1.0)
        self.assertAlmostEqual(out[2][1].area, 1.0)
        self.assertEqual(list(out[2][1].exterior.coords)[-2:], [(1.0, 1.0), (1.0, 0.0)])

    def test_delta_decoding(self):
        t = {"type": "Topology", "transform": {"scale": [0.5, 0.25], "translate": [100.0, 10.0]},
             "arcs": [[[0, 0], [4, 0], [0, 4], [-4, 0], [0, -4]]],
             "objects": {"jaffpota": {"type": "GeometryCollection", "geometries": [
                 {"type": "Polygon", "arcs": [[0]], "properties": {}}]}}}
        (_, g), = topo.decode(t)
        self.assertEqual(list(g.exterior.coords), [(100.0, 10.0), (102.0, 10.0), (102.0, 11.0), (100.0, 11.0), (100.0, 10.0)])


if __name__ == "__main__":
    unittest.main()
