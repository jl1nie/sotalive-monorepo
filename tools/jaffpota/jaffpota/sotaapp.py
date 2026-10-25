"""sotaapp2 の API を呼ぶ小さなクライアント(移行・検証のスクリプトが使う)。

認証は、環境変数 SOTAAPP_EMAIL と SOTAAPP_PASSWORD(Firebase のサインイン。POST /api/v2/auth/signin)で渡す。
ふつうは scripts/load_summit_data.sh が画面で尋ねて、子プロセスに渡す。
どちらもなければ認証なしで呼ぶ(手元のサーバーを `ADMIN_DEV_EMAIL` 付きで起動したとき)。
パスワードとトークンは、表示もログもしない。
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

# Python の既定の User-Agent(Python-urllib)は sotaapp2 の前の Cloudflare に 403 で拒まれる
USER_AGENT = "sotalive-jaffpota/1.0"


class ApiError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {str(body)[:300]}")
        self.status = status
        self.body = body


def http_request(method, url, headers, body, timeout=60):
    """(status, headers, body のバイト列)を返す。4xx・5xx も例外にしない"""
    req = urllib.request.Request(url, data=body, method=method, headers={"User-Agent": USER_AGENT, **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


LOCAL_HOSTS = ("localhost", "127.0.0.1", "[::1]")


def check_transport(base_url):
    """認証情報を送る接続先は https に限る(手元の localhost などを除く)"""
    u = urllib.parse.urlsplit(base_url)
    if u.scheme != "https" and (u.hostname or "") not in [h.strip("[]") for h in LOCAL_HOSTS]:
        raise ValueError(f"認証情報は https でだけ送ります: {base_url}")


def quote_code(code):
    """山頂コードは `/` を含むので、パスの 1 つの要素として送る(JA%2FKN-017)"""
    return urllib.parse.quote(code, safe="")


class Client:
    def __init__(self, base_url, token=None, request=None):
        self.base = base_url.rstrip("/")
        self.token = token
        # 呼び出し時に解決する(テストが差し替えられるように)
        self._request = request or (lambda *a: http_request(*a))

    @classmethod
    def from_env(cls, base_url, request=None):
        c = cls(base_url, None, request)
        email, password = os.environ.get("SOTAAPP_EMAIL"), os.environ.get("SOTAAPP_PASSWORD")
        if email and password:
            c.token = c.sign_in(email, password)
        return c

    def sign_in(self, email, password):
        check_transport(self.base)
        status, headers, body = self._request(
            "POST", f"{self.base}/api/v2/auth/signin", {"Content-Type": "application/json"},
            json.dumps({"email": email, "password": password}).encode())
        token = {k.lower(): v for k, v in headers.items()}.get("authorization")
        if status != 200 or not token:
            raise ApiError(status, "サインインできませんでした")
        return token

    def call(self, method, path, payload=None):
        headers = {"Accept": "application/json"}
        if self.token:
            check_transport(self.base)
            headers["Authorization"] = f"Bearer {self.token}"
        body = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload, ensure_ascii=False).encode()
        status, _, raw = self._request(method, f"{self.base}/api/v2{path}", headers, body)
        text = raw.decode("utf-8", "replace")
        if status >= 400:
            raise ApiError(status, text)
        return json.loads(text) if text.strip() else None

    def get(self, path):
        return self.call("GET", path)

    def put(self, path, payload):
        return self.call("PUT", path, payload)
