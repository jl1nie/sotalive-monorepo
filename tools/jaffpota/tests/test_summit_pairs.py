"""summit_pairs: 組の分類・推定の答え・目視の組み立て。

手元のバッチの元の出力(data2.json など)との一致は、環境変数 JAFFPOTA_SUMMIT_BACKUP に
`~/sotaapp2-backups/sota_pota_20261024` のようなディレクトリを渡したときだけ確かめる(データは repo に置かない)。
"""
import collections
import csv
import glob
import json
import os
import unittest

from jaffpota import summit_pairs as sp


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def read_csv(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def cand(key, pota, px):
    return {"key": key, "pota": pota, "px": px}


def classify(keys, cands, keypx, wrong=(), triage=None, heur=None):
    return sp.classify_summit([{"key": k} for k in keys], cands, keypx, set(wrong), triage or {}, heur)


def by_id(result):
    return {sp.pair_id(p["key"], p["pota"]): p for p in result["pairs"]}


class TestClassify(unittest.TestCase):
    def test_full_coverage_is_all_without_review(self):
        r = classify(["K1"], [cand("K1", "P1", 100)], {"K1": 100})
        p = by_id(r)["K1|P1"]
        self.assertEqual((p["default"], p["pct"], p["noise"], p["shallow"], p["review"]), ("all", 100.0, False, False, False))
        self.assertEqual((r["reasons"], r["review"], r["split"], r["snap"]), ([], False, False, False))

    def test_tiny_overlap_becomes_part_when_nothing_to_review(self):
        # 5% 未満は none だが、目視しない山頂では、わずかでも当たる組を「一部」にする
        r = classify(["K1"], [cand("K1", "P1", 2)], {"K1": 100})
        self.assertEqual(by_id(r)["K1|P1"]["default"], "part")
        self.assertEqual(r["reasons"], [])

    def test_no_pairs_returns_none(self):
        # 当たらず、近くもない組は候補にしない
        self.assertIsNone(classify(["K1"], [cand("K1", "P1", 0)], {"K1": 100}))
        # city_j の誤りで除いた市区町村の組も
        self.assertIsNone(classify(["K1"], [cand("K1", "P1", 100)], {"K1": 100}, wrong={"K1"}))

    def test_noise_is_pair_across_the_boundary_of_a_fully_covered_park(self):
        triage = {"K2|P1": {"in": False, "m": 10}}
        r = classify(["K1", "K2"], [cand("K1", "P1", 100), cand("K2", "P1", 0)], {"K1": 100, "K2": 100}, triage=triage)
        p = by_id(r)["K2|P1"]
        self.assertTrue(p["noise"])
        self.assertEqual((p["default"], p["dist"]), ("none", 10))
        # 誤差とみなした組は、目視の理由にならない
        self.assertEqual(r["reasons"], [])

    def test_near_park_needs_review(self):
        triage = {"K1|P1": {"in": False, "m": 20}}
        r = classify(["K1"], [cand("K1", "P1", 0)], {"K1": 100}, triage=triage)
        self.assertEqual(r["reasons"], ["near"])
        p = by_id(r)["K1|P1"]
        self.assertEqual((p["default"], p["dist"], p["review"]), ("none", 20, True))

    def test_far_park_is_not_a_candidate(self):
        triage = {"K1|P1": {"in": False, "m": 80}}
        self.assertIsNone(classify(["K1"], [cand("K1", "P1", 0)], {"K1": 100}, triage=triage))

    def test_shallow_full_coverage_near_the_edge(self):
        triage = {"K1|P1": {"in": True, "m": 30}}
        r = classify(["K1"], [cand("K1", "P1", 100)], {"K1": 100}, triage=triage)
        self.assertEqual(r["reasons"], ["shallow"])
        p = by_id(r)["K1|P1"]
        self.assertEqual((p["shallow"], p["review"], p["default"]), (True, True, "all"))

    def test_muni_split_picks_majority_park_per_muni(self):
        # 市区町村ごとに過半を占める公園が別々なら、過半の公園を「全部」にしておく
        r = classify(["K1", "K2"], [cand("K1", "P1", 60), cand("K2", "P2", 100)], {"K1": 100, "K2": 100})
        self.assertEqual(r["reasons"], ["muni"])
        self.assertTrue(r["split"])
        self.assertEqual({k: p["default"] for k, p in by_id(r).items()}, {"K1|P1": "all", "K2|P2": "all"})
        self.assertTrue(by_id(r)["K1|P1"]["review"])
        self.assertFalse(by_id(r)["K2|P2"]["review"])

    def test_snap_follows_the_muni_boundary_when_park_edge_matches(self):
        triage = {"K1|P3": {"in": False, "m": 10}}
        cands = [cand("K1", "P1", 60), cand("K1", "P3", 0)]
        r = classify(["K1"], cands, {"K1": 100}, triage=triage, heur={"f100": 0.9})
        self.assertTrue(r["snap"])
        self.assertFalse(r["split"])
        self.assertEqual({k: p["default"] for k, p in by_id(r).items()}, {"K1|P1": "all", "K1|P3": "none"})
        # 境界に沿わなければ、そのまま
        r = classify(["K1"], cands, {"K1": 100}, triage=triage, heur={"f100": 0.5})
        self.assertFalse(r["snap"])
        self.assertEqual(by_id(r)["K1|P1"]["default"], "part")

    def test_keys_are_limited_to_used_ones(self):
        r = classify(["K1", "K2", "K3"], [cand("K1", "P1", 100)], {"K1": 100, "K2": 40, "K3": 0})
        # ゾーンにかかる市区町村は、公園の組がなくても数える。かからない K3 は除く
        self.assertEqual([k["key"] for k in r["keys"]], ["K1", "K2"])


class TestAnswers(unittest.TestCase):
    P = {"noise": False, "px": 10, "pct": 50.0, "default": "none"}

    def test_data_answer(self):
        self.assertEqual(sp.data_answer({**self.P, "pct": 99.0}), "all")
        self.assertEqual(sp.data_answer(self.P), "part")
        self.assertEqual(sp.data_answer({**self.P, "noise": True}), "none")
        self.assertEqual(sp.data_answer({**self.P, "px": 0}), "none")

    def test_estimate_and_hint(self):
        # 判定表に保存がない山頂は規則の答え、ある山頂はデータの答え。参考は、もう一方
        p = self.P
        self.assertEqual((sp.estimate_answer(p, False), sp.hint_for(p, False)), ("none", "part"))
        self.assertEqual((sp.estimate_answer(p, True), sp.hint_for(p, True)), ("part", "none"))
        same = {**p, "default": "part"}
        self.assertEqual((sp.estimate_answer(same, False), sp.hint_for(same, False)), ("part", None))

    def test_note_only_when_a_rule_changed_the_answer(self):
        base = {"noise": False, "px": 10}
        no = {"split": False, "snap": False}
        self.assertIsNone(sp.note_for(base, no, False))
        self.assertIn("誤差", sp.note_for({**base, "noise": True}, no, False))
        self.assertIn("過半", sp.note_for(base, {"split": True, "snap": False}, False))
        self.assertIn("沿う", sp.note_for(base, {"split": False, "snap": True}, False))

    def test_split_note_is_not_written_for_pairs_the_rule_did_not_touch(self):
        # split は、当たっている組にだけ働く。px が 0 の組には書かない
        self.assertIsNone(sp.note_for({"noise": False, "px": 0}, {"split": True, "snap": False}, False))

    def test_rule_notes_are_not_written_when_the_estimate_is_the_data_answer(self):
        # 判定表に保存がある山頂の推定はデータの答え。split・snap の規則の答えは hint の側
        base = {"noise": False, "px": 10}
        self.assertIsNone(sp.note_for(base, {"split": True, "snap": False}, True))
        self.assertIsNone(sp.note_for(base, {"split": False, "snap": True}, True))
        # 誤差の判定は、データの答えにも効く
        self.assertIn("誤差", sp.note_for({**base, "noise": True}, {"split": True, "snap": False}, True))


def pair(key, pota, default="part", **kw):
    return {"key": key, "pota": pota, "px": 10, "pct": 50.0, "noise": False, "default": default, **kw}


class TestVerdicts(unittest.TestCase):
    def verdicts(self, summits, saved=None, rereview=None, manual=None):
        saved = saved or {}
        has_saved = {c: bool(saved.get(c)) for c in summits}
        return sp.build_verdicts(summits, saved, rereview or {}, manual or [], has_saved)

    def test_saved_answers_equal_to_the_initial_ones_are_not_trusted(self):
        # 最初に選んでおいた答えのまま保存された山頂は、見たかどうか区別できないので目視とみなさない
        summits = {"S1": [pair("K", "P1", "part")]}
        self.assertEqual(self.verdicts(summits, saved={"S1": {"K|P1": "part"}}), {})

    def test_saved_answers_changed_from_the_initial_ones_are_trusted(self):
        summits = {"S1": [pair("K", "P1", "part"), pair("K", "P2", "all")]}
        v = self.verdicts(summits, saved={"S1": {"K|P1": "none"}})
        # 保存のない組は、今まで配信していた答え(データの答え)で埋める
        self.assertEqual(v["S1"]["K|P1"], {"coverage": "none", "source": "human"})
        self.assertEqual(v["S1"]["K|P2"], {"coverage": "part", "source": "filled"})

    def test_confirmed_summit_is_trusted_even_if_unchanged(self):
        summits = {"JA/KN-017": [pair("K", "P1", "part")]}
        v = self.verdicts(summits, saved={"JA/KN-017": {"K|P1": "part"}})
        self.assertEqual(v["JA/KN-017"]["K|P1"]["source"], "human")

    def test_rereview_replaces_saved_and_needs_every_pair(self):
        summits = {"S1": [pair("K", "P1"), pair("K", "P2")]}
        v = self.verdicts(summits, saved={"S1": {"K|P1": "none"}}, rereview={"S1": {"K|P1": "all", "K|P2": "none"}})
        self.assertEqual({k: a["coverage"] for k, a in v["S1"].items()}, {"K|P1": "all", "K|P2": "none"})
        with self.assertRaises(ValueError):
            self.verdicts(summits, rereview={"S1": {"K|P1": "all"}})

    def test_manual_overrides_everything_and_creates_a_verdict_for_the_rest(self):
        summits = {"S1": [pair("K", "P1", "all"), pair("K", "P2", "part")]}
        v = self.verdicts(summits, manual=[{"summit": "S1", "muni_key": "K", "pota_code": "P2", "coverage": "none"}])
        self.assertEqual(v["S1"]["K|P2"], {"coverage": "none", "source": "human"})
        self.assertEqual(v["S1"]["K|P1"], {"coverage": "all", "source": "filled"})

    def test_manual_on_a_pair_that_is_not_a_candidate(self):
        summits = {"S1": [pair("K", "P1")]}
        none_row = {"summit": "S1", "muni_key": "K", "pota_code": "PX", "coverage": "none"}
        self.assertEqual(self.verdicts(summits, manual=[none_row]), {})
        with self.assertRaises(ValueError):
            self.verdicts(summits, manual=[{**none_row, "coverage": "all"}])

    def test_served_prefers_verdict_and_drops_none(self):
        estimates = {"S1": {"K|P1": "part", "K|P2": "all", "K|P3": "none"}}
        verdicts = {"S1": {"K|P1": {"coverage": "none", "source": "human"},
                           "K|P2": {"coverage": "part", "source": "filled"},
                           "K|P3": {"coverage": "all", "source": "human"}}}
        self.assertEqual(sp.served(estimates, verdicts), {"S1": {"K|P2": ("part", 0), "K|P3": ("all", 1)}})
        # 目視のない山頂は、推定のまま(verified=0)
        self.assertEqual(sp.served({"S2": {"K|P1": "all", "K|P2": "none"}}, {}), {"S2": {"K|P1": ("all", 0)}})


BACKUP = os.environ.get("JAFFPOTA_SUMMIT_BACKUP")


@unittest.skipUnless(BACKUP, "JAFFPOTA_SUMMIT_BACKUP を渡したときだけ(手元のバッチの出力が要る)")
class TestAgainstOriginalBatch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        b = os.path.expanduser(BACKUP)
        cls.b = b
        cls.D = {s["code"]: s for s in read_json(f"{b}/data2.json")["summits"]}

    def load_v(self, d):
        V = {}
        for f in glob.glob(f"{self.b}/{d}/*.json"):
            j = read_json(f)
            V.update(j.get("data", j).get("v", {}))
        return V

    def test_classify_reproduces_review2_data(self):
        b = self.b
        T = read_json(f"{b}/triage.json")
        H = read_json(f"{b}/heur.json")
        keypx = collections.defaultdict(lambda: collections.defaultdict(int))
        for x in read_csv(f"{b}/zones_all2/summit_muni.csv"):
            keypx[x["summit"]][x["muni_key"]] += int(x["pixels"])
        wrong = collections.defaultdict(set)
        for x in read_csv(f"{b}/city_j_fixes.csv"):
            wrong[x["summit"]].add(x["wrong"])
        for code, s in self.D.items():
            cands = [cand(p["key"], p["pota"], p["px"]) for p in s["pairs"]]
            r = sp.classify_summit(s["keys"], cands, dict(keypx[code]), wrong[code], T.get(code, {}), H.get(code))
            got = {k: r[k] for k in ("keys", "pairs", "partial", "split", "snap", "reasons", "review")}
            exp = {k: s[k] for k in got}
            self.assertEqual(got, exp, code)

    def test_served_reproduces_the_old_summit_pota_csv(self):
        b = self.b
        old = {}
        for r in read_csv(f"{b}/sotaapp_out6/summit_pota.csv"):
            old[(r["summit_code"], r["muni_key"], r["pota_code"])] = (r["coverage"], int(r["verified"]))
        saved = {c: v.get("pairs", {}) for c, v in self.load_v("db_dump/verdicts2").items()}
        rereview = {c: v["pairs"] for c, v in self.load_v("db_dump5/verdicts").items()}
        manual = list(read_csv(f"{b}/manual_fixes.csv"))
        has_saved = {c: bool(saved.get(c)) for c in self.D}
        summits = {c: s["pairs"] for c, s in self.D.items()}
        estimates = {c: {sp.pair_id(p["key"], p["pota"]): sp.estimate_answer(p, has_saved[c]) for p in s["pairs"]}
                     for c, s in self.D.items()}
        verdicts = sp.build_verdicts(summits, saved, rereview, manual, has_saved)
        new = {(c,) + tuple(pid.split("|")): a for c, m in sp.served(estimates, verdicts).items() for pid, a in m.items()}
        self.assertEqual(new, old)


if __name__ == "__main__":
    unittest.main()
