"""migrate_verdicts と verify_served と sotaapp のクライアント。偽の sotaapp2 で確かめる。"""
import contextlib
import io
import json
import os
import tempfile
import unittest
import urllib.parse
from unittest import mock

from jaffpota import migrate_verdicts as mv
from jaffpota import verify_served as vs
from jaffpota.sotaapp import ApiError, Client, quote_code


class FakeServer:
    """見直しの API の振る舞いだけを真似る。pairs: {code: [(muniKey, potaCode)]}"""

    def __init__(self, pairs, rev="rev1"):
        self.pairs = pairs
        self.rev = rev
        self.verdicts = {}  # code -> {(muniKey, potaCode): coverage}
        self.notes = {}  # code -> 確定の note(画面で確定したものは None)
        self.calls = []
        self.fail_put = set()

    def __call__(self, method, url, headers, body):
        path = urllib.parse.urlsplit(url).path
        self.calls.append((method, path, headers))
        if path == "/api/v2/auth/signin":
            d = json.loads(body)
            if d["password"] == "good":
                return 200, {"Authorization": "tok123"}, b"Successfully LoggedIn"
            return 401, {}, b"Invalid Credentials"
        prefix = "/api/v2/sota/review/summits/"
        if not path.startswith(prefix):
            return 404, {}, b"{}"
        code = urllib.parse.unquote(path[len(prefix):])
        if code not in self.pairs:
            return 404, {}, b'{"error":"not found"}'
        if method == "GET":
            v = self.verdicts.get(code, {})
            detail = {"inputRev": self.rev,
                      "pairs": [{"muniKey": k, "potaCode": p, **({"verdict": v[(k, p)]} if (k, p) in v else {})}
                                for k, p in self.pairs[code]]}
            if v:
                detail["review"] = {"inputRev": self.rev, "reviewedBy": "dev@example.com", "note": self.notes.get(code)}
            return 200, {}, json.dumps(detail).encode()
        if method == "PUT":
            d = json.loads(body)
            if code in self.fail_put:
                return 409, {}, b'{"code":"CONFLICT"}'
            got = {(a["muniKey"], a["potaCode"]) for a in d["answers"]}
            if got != set(self.pairs[code]) or len(got) != len(d["answers"]):
                return 400, {}, b'{"code":"BAD_REQUEST"}'
            if d["inputRev"] != self.rev:
                return 409, {}, b'{"code":"CONFLICT"}'
            self.verdicts[code] = {(a["muniKey"], a["potaCode"]): a["coverage"] for a in d["answers"]}
            self.notes[code] = d.get("note")
            return 200, {}, b"{}"
        return 405, {}, b"{}"


def verdicts_for(spec):
    """{code: {(k, p): coverage}} から verdicts.json の verdicts にする"""
    return {c: {f"{k}|{p}": {"coverage": cov, "source": "human"} for (k, p), cov in m.items()} for c, m in spec.items()}


PAIRS = {"JA/AA-001": [("K1", "P1"), ("K1", "P2")], "JA/BB-002": [("K2", "P1")]}
GOOD = verdicts_for({"JA/AA-001": {("K1", "P1"): "all", ("K1", "P2"): "none"}, "JA/BB-002": {("K2", "P1"): "part"}})


class TestPlan(unittest.TestCase):
    def test_plan_collects_what_to_write(self):
        srv = FakeServer(PAIRS)
        todo, same, problems = mv.plan(Client("http://x", request=srv), GOOD)
        self.assertEqual((len(todo), same, problems), (2, [], []))
        code, rev, answers = todo[0]
        self.assertEqual((code, rev), ("JA/AA-001", "rev1"))
        self.assertEqual(answers[1], {"muniKey": "K1", "potaCode": "P2", "coverage": "none"})

    def test_summit_code_is_one_path_segment(self):
        srv = FakeServer(PAIRS)
        mv.plan(Client("http://x", request=srv), GOOD)
        self.assertTrue(all("%2F" in p for _, p, _ in srv.calls))
        self.assertEqual(quote_code("JA/KN-017"), "JA%2FKN-017")

    def test_mismatched_pairs_and_missing_summits_are_problems(self):
        srv = FakeServer(PAIRS)
        bad = {**GOOD, "JA/AA-001": verdicts_for({"x": {("K1", "P1"): "all"}})["x"], "JA/ZZ-009": GOOD["JA/BB-002"]}
        todo, same, problems = mv.plan(Client("http://x", request=srv), bad)
        self.assertEqual([c for c, *_ in todo], ["JA/BB-002"])
        self.assertEqual(len(problems), 2)
        self.assertTrue(any("JA/AA-001" in p and "一致しません" in p for p in problems))
        self.assertTrue(any("JA/ZZ-009" in p for p in problems))

    def test_only_limits_the_summits(self):
        srv = FakeServer(PAIRS)
        todo, _, _ = mv.plan(Client("http://x", request=srv), GOOD, only={"JA/BB-002"})
        self.assertEqual([c for c, *_ in todo], ["JA/BB-002"])


class TestMain(unittest.TestCase):
    def run_main(self, srv, verdicts, *extra):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "verdicts.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"version": 1, "verdicts": verdicts}, f)
            out = io.StringIO()
            with mock.patch("jaffpota.sotaapp.http_request", srv), mock.patch.dict(os.environ, {}, clear=True), \
                    contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
                rc = mv.main([path, "--base-url", "http://x", *extra])
        return rc, out.getvalue()

    def puts(self, srv):
        return [c for c in srv.calls if c[0] == "PUT"]

    def test_dry_run_writes_nothing(self):
        srv = FakeServer(PAIRS)
        rc, out = self.run_main(srv, GOOD, "--dry-run")
        self.assertEqual((rc, self.puts(srv)), (0, []))
        self.assertIn("書く 2", out)

    def test_a_problem_stops_before_writing_anything(self):
        srv = FakeServer(PAIRS)
        bad = {**GOOD, "JA/BB-002": verdicts_for({"x": {("K9", "P9"): "all"}})["x"]}
        rc, out = self.run_main(srv, bad)
        self.assertEqual((rc, self.puts(srv)), (1, []))
        self.assertIn("問題", out)

    def test_write_then_rerun_is_a_noop(self):
        srv = FakeServer(PAIRS)
        rc, _ = self.run_main(srv, GOOD)
        self.assertEqual((rc, len(self.puts(srv))), (0, 2))
        self.assertEqual(srv.verdicts["JA/AA-001"][("K1", "P2")], "none")
        rc, out = self.run_main(srv, GOOD)
        self.assertEqual((rc, len(self.puts(srv))), (0, 2))  # 増えない
        self.assertIn("確定済みで同じ 2", out)

    def test_changed_verdict_is_written_again(self):
        srv = FakeServer(PAIRS)
        self.run_main(srv, GOOD)
        changed = {**GOOD, "JA/BB-002": verdicts_for({"x": {("K2", "P1"): "all"}})["x"]}
        _, out = self.run_main(srv, changed)
        self.assertEqual(len(self.puts(srv)), 3)
        self.assertEqual(srv.verdicts["JA/BB-002"][("K2", "P1")], "all")

    def test_review_confirmed_on_the_screen_is_not_overwritten(self):
        srv = FakeServer(PAIRS)
        # 管理画面で人が確定した(note が移行のものではない)
        srv.verdicts["JA/BB-002"] = {("K2", "P1"): "none"}
        srv.notes["JA/BB-002"] = None
        rc, out = self.run_main(srv, GOOD)
        self.assertEqual((rc, self.puts(srv)), (1, []))  # 何も書かずに止まる
        self.assertIn("管理画面で確定済み", out)
        self.assertEqual(srv.verdicts["JA/BB-002"][("K2", "P1")], "none")
        # 上書きしてよいと言ったときだけ書く
        rc, _ = self.run_main(srv, GOOD, "--overwrite-reviews")
        self.assertEqual(rc, 0)
        self.assertEqual(srv.verdicts["JA/BB-002"][("K2", "P1")], "part")

    def test_only_needs_summits(self):
        srv = FakeServer(PAIRS)
        with self.assertRaises(SystemExit):
            self.run_main(srv, GOOD, "--only")
        rc, _ = self.run_main(srv, GOOD, "--only", "JA/BB-002")
        self.assertEqual((rc, list(srv.verdicts)), (0, ["JA/BB-002"]))

    def test_failure_stops_and_reports_how_far_it_got(self):
        srv = FakeServer(PAIRS)
        srv.fail_put = {"JA/BB-002"}
        with self.assertRaises(ApiError):
            self.run_main(srv, GOOD)
        self.assertEqual(list(srv.verdicts), ["JA/AA-001"])  # 書けた分は残り、再実行で続きから


class TestClient(unittest.TestCase):
    def test_sign_in_token_is_sent_as_bearer_and_never_in_the_url(self):
        srv = FakeServer(PAIRS)
        env = {"SOTAAPP_EMAIL": "a@example.com", "SOTAAPP_PASSWORD": "good"}
        with mock.patch.dict(os.environ, env, clear=True):
            c = Client.from_env("https://x", request=srv)
        c.get("/sota/review/summits/JA%2FAA-001")
        method, path, headers = srv.calls[-1]
        self.assertEqual(headers["Authorization"], "Bearer tok123")
        self.assertNotIn("good", path)

    def test_bad_password_raises_without_echoing_it(self):
        srv = FakeServer(PAIRS)
        with mock.patch.dict(os.environ, {"SOTAAPP_EMAIL": "a@example.com", "SOTAAPP_PASSWORD": "wrong"}, clear=True):
            with self.assertRaises(ApiError) as cm:
                Client.from_env("https://x", request=srv)
        self.assertNotIn("wrong", str(cm.exception))

    def test_no_credentials_means_no_authorization_header(self):
        srv = FakeServer(PAIRS)
        with mock.patch.dict(os.environ, {}, clear=True):
            c = Client.from_env("https://x", request=srv)
        c.get("/sota/review/summits/JA%2FAA-001")
        self.assertNotIn("Authorization", srv.calls[-1][2])

    def test_credentials_are_sent_only_over_https_or_localhost(self):
        srv = FakeServer(PAIRS)
        with self.assertRaises(ValueError):
            Client("http://example.com", token="t", request=srv).get("/x")
        with self.assertRaises(ValueError):
            Client("http://example.com", request=srv).sign_in("a@example.com", "pw")
        Client("https://example.com", token="t", request=srv).get("/sota/review/summits/JA%2FAA-001")
        Client("http://127.0.0.1:18081", token="t", request=srv).get("/sota/review/summits/JA%2FAA-001")
        Client("http://localhost:18081", token="t", request=srv).get("/sota/review/summits/JA%2FAA-001")
        # 認証情報がなければ、http でもよい(公開の API)
        Client("http://example.com", request=srv).get("/sota/review/summits/JA%2FAA-001")
        self.assertFalse(any("pw" in c[1] for c in srv.calls))

    def test_user_agent_is_not_the_default_one(self):
        # 既定の Python-urllib は Cloudflare に 403 で拒まれる
        from jaffpota import sotaapp
        self.assertNotIn("Python-urllib", sotaapp.USER_AGENT)


def fc(*features):
    return {"type": "FeatureCollection", "summit": "S", "features": list(features)}


def f(kind, geom="g", **props):
    return {"type": "Feature", "properties": {"kind": kind, **props}, "geometry": geom}


class TestVerifyServed(unittest.TestCase):
    def test_served_rows(self):
        view = {"munis": [{"muniKey": "K1", "parks": [{"potaCode": "P1", "coverage": "all", "verified": True},
                                                      {"potaCode": "P2", "coverage": "part", "verified": False}]}]}
        self.assertEqual(vs.served_rows(view), {("K1", "P1"): ("all", True), ("K1", "P2"): ("part", False)})

    def test_compare_answers(self):
        old = {("K1", "P1"): "all", ("K1", "P2"): "part"}
        same = {("K1", "P1"): ("all", False), ("K1", "P2"): ("part", False)}
        self.assertEqual(vs.compare_answers("S", old, same), [])
        probs = vs.compare_answers("S", old, {("K1", "P1"): ("part", False), ("K9", "P9"): ("all", False)})
        self.assertEqual(len(probs), 3)  # 配信にない・旧にない・答えが違う

    def test_verified_follows_the_verdicts(self):
        served = {("K1", "P1"): ("all", True), ("K1", "P2"): ("part", False)}
        old = {k: c for k, (c, _) in served.items()}
        self.assertEqual(vs.compare_answers("S", old, served, verdict_pairs={"K1|P1"}), [])
        self.assertEqual(len(vs.compare_answers("S", old, served, verdict_pairs=set())), 1)
        self.assertEqual(len(vs.compare_answers("S", old, served, verdict_pairs={"K1|P1", "K1|P2"})), 1)

    def test_maps_ignore_judge_layers_and_pota_order(self):
        old = fc(f("zone"), f("muni", key="K1", pota=[{"code": "P1"}, {"code": "P2"}]), f("park", "pg", code="P1", key="K1"))
        new = fc(f("zone"), f("judge_park", code="P1"), f("peak"),
                 f("muni", key="K1", pota=[{"code": "P2"}, {"code": "P1"}]), f("park", "pg", code="P1", key="K1"))
        self.assertEqual(vs.compare_maps("S", old, new), [])

    def test_maps_report_differences(self):
        old = fc(f("zone", "a"), f("park", "pg", code="P1", key="K1"))
        new = fc(f("zone", "b"), f("park", "pg", code="P2", key="K1"))
        probs = vs.compare_maps("S", old, new)
        self.assertEqual(len(probs), 3)  # zone が違う、park が配信にない、park が旧にない

    def test_map_coordinates_are_compared_with_tolerance(self):
        # サーバーの JSON の読み書きで、最後の桁がわずかに変わる
        old = fc(f("zone", {"type": "Polygon", "coordinates": [[[137.65379000000001, 35.1]]]}))
        new = fc(f("zone", {"type": "Polygon", "coordinates": [[[137.65379, 35.1]]]}))
        self.assertEqual(vs.compare_maps("S", old, new), [])
        far = fc(f("zone", {"type": "Polygon", "coordinates": [[[137.65380, 35.1]]]}))
        self.assertEqual(len(vs.compare_maps("S", old, far)), 1)

    def test_map_top_level_fields_are_compared(self):
        old = {**fc(f("zone")), "bbox": [1.0, 2.0, 3.0, 4.0], "attribution": "a"}
        self.assertEqual(vs.compare_maps("S", old, {**old}), [])
        self.assertEqual(len(vs.compare_maps("S", old, {**old, "summit": "T"})), 1)
        self.assertEqual(len(vs.compare_maps("S", old, {**old, "attribution": "b"})), 1)
        self.assertEqual(len(vs.compare_maps("S", old, {**old, "bbox": [1.0, 2.0, 3.0, 4.1]})), 1)

    def test_duplicated_features_are_not_collapsed(self):
        one = fc(f("park", "pg", code="P1", key="K1"))
        two = fc(f("park", "pg", code="P1", key="K1"), f("park", "pg", code="P1", key="K1"))
        self.assertEqual(vs.compare_maps("S", two, one), ["S: park が配信にない 1 件 (例 {\"code\": \"P1\", \"key\": \"K1\", \"kind\": \"park\"})"])

    def test_muni_names_are_compared(self):
        view = {"munis": [{"muniKey": "K1", "muniName": "県A市", "parks": [{"potaCode": "P1", "coverage": "all", "verified": False}]}]}
        self.assertEqual(vs.compare_names("S", {("K1", "P1"): "県A市"}, view), [])
        self.assertEqual(len(vs.compare_names("S", {("K1", "P1"): "県B市"}, view)), 1)

    def test_network_errors_become_differences_not_crashes(self):
        class Boom:
            def get(self, path):
                raise TimeoutError("timed out")

        probs = vs.check_summit(Boom(), "S", {}, fc(f("zone")), None)
        self.assertEqual(len(probs), 2)
        self.assertIn("TimeoutError", probs[0])

    def test_old_rows_and_maps_loaders(self):
        with tempfile.TemporaryDirectory() as d:
            csv_path = os.path.join(d, "a.csv")
            with open(csv_path, "w", encoding="utf-8", newline="") as fh:
                fh.write("summit_code,muni_key,muni_name,pota_code,coverage,verified\nS,K,n,P,part,1\n")
            self.assertEqual(vs.load_old_rows(csv_path), {"S": {("K", "P"): "part"}})
            import gzip
            gz = os.path.join(d, "m.jsonl.gz")
            with gzip.open(gz, "wt", encoding="utf-8") as fh:
                fh.write(json.dumps(fc(f("zone"))) + "\n\n")
            self.assertEqual(list(vs.load_old_maps(gz)), ["S"])


if __name__ == "__main__":
    unittest.main()
