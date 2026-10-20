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

  // FLEonline は /fle/ で動く（PWA の範囲が /fle/ のため、ルートは転送する）
  if (hostname.startsWith("fle") && (url.pathname === "/" || url.pathname === "")) {
    return Response.redirect(new URL("/fle/" + url.search, url).toString(), 302);
  }

  // FLEonline の設定の同期は、この Functions で処理する(バックエンドには送らない)
  if (url.pathname.startsWith("/api/fle/prefs/")) {
    return context.next();
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

  // www の /logconv 以下は、旧版の logconv(logconv.sotalive.net。新しい logconv のテストが済むまで Vercel に残す)へ転送する。
  // logconv を Pages に切り替えるときは、この転送を外す(appPathFor が www の /logconv 以下を logconv にする)
  if (hostname.startsWith("www.") && url.pathname.startsWith("/logconv")) {
    const rest = url.pathname.slice("/logconv".length) || "/";
    return Response.redirect(`https://logconv.sotalive.net${rest}${url.search}`, 302);
  }

  // サブドメインに基づいてアプリを選択
  // WSPRはlogconvのタブ内に含まれるため独立アプリ不要
  const appPath = appPathFor(hostname, url.pathname);

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

    // アプリ自身のファイルを先に探す(旧版 myact の js/api.js・css/myact.css など)。
    // なければ、共通アセット(旧版の myact・myqth が共有する css・js・img など。Vercel 版ではシンボリックリンクだった)
    let response = await fetchAsset(context.env.ASSETS, assetUrl, context.request);
    const shared = sharedAssetUrl(assetUrl);
    if (response.status === 404 && shared) {
      response = await fetchAsset(context.env.ASSETS, shared, context.request);
    }
    // React 版の myact は試験中。検索エンジンに載せない
    if (appPath === "/myact2") {
      response = new Response(response.body, response);
      response.headers.set("x-robots-tag", "noindex");
    }
    return response;
  }

  // サブドメインなし（sotalive.pages.dev など）はそのまま配信
  return fetchAsset(context.env.ASSETS, url, context.request);
};

/**
 * ホスト名から、配信するアプリのパスを決める(なければ空)
 *
 * - myact2 は React 版の myact(試験中。ビルドの base が `/` なので、このホスト名でだけ動く)
 * - myact・mypilgrim・www(`/logconv` 以下を除く)は、旧版の myact(Vercel 版と同じ)
 * - www の `/logconv` 以下は logconv(Vercel 版と同じ)
 */
function appPathFor(hostname: string, pathname: string): string {
  if (hostname.startsWith("www.")) return pathname.startsWith("/logconv") ? "/logconv" : "/myact";
  if (hostname.startsWith("myact2")) return "/myact2";
  if (hostname.startsWith("myact") || hostname.startsWith("mypilgrim")) return "/myact";
  if (hostname.startsWith("myqth")) return "/myqth";
  if (hostname.startsWith("fle")) return "/fle";
  if (hostname.startsWith("logconv")) return "/logconv";
  return "";
}

/**
 * 共通アセットの場所(`/shared/common/...`)。共通アセットのパスでなければ null。
 * ファビコン(`/favicon-16x16-qth.png` など)は、共通アセットの `favicon/` の中にある
 */
function sharedAssetUrl(url: URL): URL | null {
  const sharedPaths = ["/css/", "/js/", "/img/", "/font/", "/svg/", "/json/", "/favicon"];
  // パスのいちばん手前にあるもの(`/font/css/…` は `/font/`)
  const found = sharedPaths
    .map((prefix) => ({ prefix, idx: url.pathname.indexOf(prefix) }))
    .filter(({ idx }) => idx >= 0)
    .sort((a, b) => a.idx - b.idx)[0];
  if (!found) return null;
  const rest = url.pathname.substring(found.idx);
  const shared = new URL(url);
  shared.pathname = found.prefix === "/favicon" ? `/shared/common/favicon${rest}` : `/shared/common${rest}`;
  return shared;
}
