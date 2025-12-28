// Cloudflare Pages Middleware
// サブドメインに基づいてルーティング + API プロキシ

const BACKEND_URL = "https://sotaapp2.fly.dev";

interface Env {
  ASSETS: Fetcher;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const hostname = url.hostname;

  // APIリクエストはバックエンドにプロキシ
  if (url.pathname.startsWith("/api/")) {
    const backendUrl = new URL(url.pathname + url.search, BACKEND_URL);
    const headers = new Headers(context.request.headers);
    headers.set("X-Forwarded-Host", hostname);

    return fetch(backendUrl.toString(), {
      method: context.request.method,
      headers,
      body: context.request.body,
    });
  }

  // サブドメインに基づいてアプリを選択
  let appPath = "";
  if (hostname.startsWith("myact")) {
    appPath = "/myact";
  } else if (hostname.startsWith("logconv")) {
    appPath = "/logconv";
  } else if (hostname.startsWith("wspr")) {
    appPath = "/wspr";
  }

  // パスを書き換えてアセットを取得
  if (appPath && url.pathname === "/") {
    url.pathname = `${appPath}/index.html`;
  } else if (appPath) {
    url.pathname = `${appPath}${url.pathname}`;
  }

  // 共通アセットへのフォールバック
  // /css/, /js/, /img/, /font/, /svg/, /favicon* は shared から取得
  const sharedPaths = ["/css/", "/js/", "/img/", "/font/", "/svg/", "/favicon"];
  for (const prefix of sharedPaths) {
    if (url.pathname.includes(prefix)) {
      url.pathname = `/shared/common${url.pathname.substring(url.pathname.indexOf(prefix))}`;
      break;
    }
  }

  return context.env.ASSETS.fetch(new Request(url.toString(), context.request));
};
