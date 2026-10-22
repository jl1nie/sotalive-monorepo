// バックエンド(sotaapp2)への中継。FLEonline は、山・公園の検索などで /api/v2 を呼ぶ。
// バックエンドの URL は、Pages のプロジェクトの環境変数 BACKEND_URL で決める(リポジトリには書かない)。
// なければ、公開しているバックエンドのドメイン
const PUBLIC_BACKEND_URL = "https://sotaapp2.sotalive.net";

export const onRequest: PagesFunction<{ BACKEND_URL?: string }> = async ({ request, env }) => {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", url.hostname);
  return fetch(new URL(url.pathname + url.search, env.BACKEND_URL || PUBLIC_BACKEND_URL).toString(), {
    method: request.method,
    headers,
    body: request.body,
  });
};
