// バックエンド(sotaapp2)への中継。FLEonline は、山・公園の検索などで /api/v2 を呼ぶ
const BACKEND_URL = "https://sotaapp2.fly.dev";

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", url.hostname);
  return fetch(new URL(url.pathname + url.search, BACKEND_URL).toString(), {
    method: request.method,
    headers,
    body: request.body,
  });
};
