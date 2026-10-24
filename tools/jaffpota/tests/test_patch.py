"""patch の API 照合。"""
import io
import json
import unittest
from unittest import mock

from jaffpota import patch


class TestQueryPark(unittest.TestCase):
    def setUp(self):
        patch._cache.clear()

    def test_sends_user_agent(self):
        # 既定の Python-urllib の User-Agent は Cloudflare に 403 で拒まれる
        seen = {}

        def fake(req, timeout):
            seen["ua"] = req.get_header("User-agent")
            return io.BytesIO(json.dumps({"potaCode": "JP-0001"}).encode())

        with mock.patch("urllib.request.urlopen", fake):
            self.assertEqual(patch.query_park("https://example.test", "JP-0001"), {"potaCode": "JP-0001"})
        self.assertEqual(seen["ua"], patch.USER_AGENT)
        self.assertNotIn("Python-urllib", seen["ua"])


if __name__ == "__main__":
    unittest.main()
