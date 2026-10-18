// Cloudflare Pages Middleware
// サブドメインに基づいてルーティング + API プロキシ

const BACKEND_URL = "https://sotaapp2.fly.dev";

interface Env {
  ASSETS: Fetcher;
}

// アセットを取得するヘルパー関数（リダイレクトを自動追跡）
async function fetchAsset(
  assets: Fetcher,
  url: URL,
  request: Request
): Promise<Response> {
  const response = await assets.fetch(new Request(url.toString(), request));

  // 308/301/302 リダイレクトの場合、index.htmlを追加して再取得
  if (response.status === 308 || response.status === 301 || response.status === 302) {
    const location = response.headers.get("location");
    if (location) {
      const redirectUrl = new URL(location, url.origin);
      // ディレクトリへのリダイレクトなら index.html を追加
      if (redirectUrl.pathname.endsWith("/")) {
        redirectUrl.pathname += "index.html";
      }
      return assets.fetch(new Request(redirectUrl.toString(), request));
    }
  }

  return response;
}

// 準備中のページ（myact2 は、公開の準備ができるまでこれを返す）
const UNDER_CONSTRUCTION = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Under Construction</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; text-align: center;
         font: 16px/1.6 system-ui, sans-serif; padding: 1rem; }
  h1 { font-size: 1.75rem; margin: 0 0 .5rem; }
  p { margin: 0; opacity: .8; }
</style>
</head>
<body>
<main>
  <h1>Under Construction</h1>
  <p>現在、準備中です。</p>
  <p>This site is under construction.</p>
</main>
</body>
</html>`;

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const hostname = url.hostname;

  // myact2 は準備中
  if (hostname.startsWith("myact2")) {
    return new Response(UNDER_CONSTRUCTION, {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "retry-after": "86400",
        "cache-control": "no-store",
        "x-robots-tag": "noindex",
      },
    });
  }

  // FLEonline は /fle/ で動く（PWA の範囲が /fle/ のため、ルートは転送する）
  if (hostname.startsWith("fle") && (url.pathname === "/" || url.pathname === "")) {
    return Response.redirect(new URL("/fle/" + url.search, url).toString(), 302);
  }

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
  // WSPRはlogconvのタブ内に含まれるため独立アプリ不要
  let appPath = "";
  if (hostname.startsWith("myact2")) {
    appPath = "/myact2";
  } else if (hostname.startsWith("myact")) {
    appPath = "/myact";
  } else if (hostname.startsWith("fle")) {
    appPath = "/fle";
  } else if (hostname.startsWith("logconv2")) {
    appPath = "/logconv";
  } else if (hostname.startsWith("logconv")) {
    appPath = "/logconv";
  }

  // パスを書き換えてアセットを取得
  if (appPath) {
    const assetUrl = new URL(url);
    if (url.pathname === "/" || url.pathname === "") {
      // ルートはディレクトリパスとして指定（Pagesがindex.htmlを自動解決）
      assetUrl.pathname = `${appPath}/`;
    } else if (!url.pathname.startsWith(appPath)) {
      // アプリパスを付与
      assetUrl.pathname = `${appPath}${url.pathname}`;
    }

    // 共通アセットへのフォールバック
    const sharedPaths = ["/css/", "/js/", "/img/", "/font/", "/svg/", "/favicon"];
    for (const prefix of sharedPaths) {
      if (assetUrl.pathname.includes(prefix)) {
        const idx = assetUrl.pathname.indexOf(prefix);
        assetUrl.pathname = `/shared/common${assetUrl.pathname.substring(idx)}`;
        break;
      }
    }

    return fetchAsset(context.env.ASSETS, assetUrl, context.request);
  }

  // サブドメインなし（sotalive.pages.dev など）はそのまま配信
  return fetchAsset(context.env.ASSETS, url, context.request);
};
