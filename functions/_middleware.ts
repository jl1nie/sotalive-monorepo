// Cloudflare Pages Middleware
// サブドメインに基づいてルーティング + API プロキシ

// バックエンドの URL は、Pages のプロジェクトの環境変数 BACKEND_URL で決める(リポジトリには書かない)。
// なければ、公開しているバックエンドのドメイン
const PUBLIC_BACKEND_URL = "https://sotaapp2.sotalive.net";

interface Env {
  ASSETS: Fetcher;
  BACKEND_URL?: string;
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
    const backendUrl = new URL(url.pathname + url.search, context.env.BACKEND_URL || PUBLIC_BACKEND_URL);
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
  const appPath = appPathFor(hostname);

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
    // React 版の myact・新しい myqth は試験中。検索エンジンに載せない
    if (appPath === "/myact2" || appPath === "/myqth2") {
      response = new Response(response.body, response);
      response.headers.set("x-robots-tag", "noindex");
    }
    return response;
  }

  // サブドメインなし（sotalive.pages.dev など）はそのまま配信
  return fetchAsset(context.env.ASSETS, url, context.request);
};

/**
 * ホスト名から、配信するアプリのパスを決める(なければ空)。このプロジェクト(sotalive)は、まだ公開していないアプリだけ。
 * 公開しているアプリ(旧版の myact、新版の myqth、FLEonline)は、別のプロジェクト(scripts/build-static-projects.sh)
 *
 * - myact2 は React 版の myact(試験中。ビルドの base が `/` なので、このホスト名でだけ動く)
 * - myqth2 は myqth の新版を、本番より先に試す場所(Vite + 素の TS。base が `/`)。`myqth`(本番。別のプロジェクト)とは別
 * - logconv2 は新しい logconv
 */
function appPathFor(hostname: string): string {
  if (hostname.startsWith("myact2")) return "/myact2";
  if (hostname.startsWith("myqth2")) return "/myqth2";
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
