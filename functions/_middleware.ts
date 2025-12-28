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
  // WSPRはlogconvのタブ内に含まれるため独立アプリ不要
  let appPath = "";
  if (hostname.startsWith("myact")) {
    appPath = "/myact";
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
