// functions/_middleware.ts の、ホスト名による振り分け(プロジェクト sotalive: まだ公開していない myact2・myqth2)。
// ASSETS(Pages の静的ファイル)を差し替えて、どのパスを取りに行くかを確かめる。
import { describe, expect, it } from 'vitest'
import { onRequest } from '../../functions/_middleware.ts'

/** ASSETS を差し替えて呼ぶ。`existing` にあるパスだけ 200、ほかは 404。取りに行ったパスの順を返す */
async function call(url: string, existing: string[] = []) {
  const fetched: string[] = []
  const ASSETS = {
    fetch: async (req: Request) => {
      const path = new URL(req.url).pathname
      fetched.push(path)
      return existing.includes(path) ? new Response('asset', { status: 200 }) : new Response('', { status: 404 })
    },
  }
  const context = { request: new Request(url), env: { ASSETS } } as unknown as Parameters<typeof onRequest>[0]
  const response = await onRequest(context)
  return { response, fetched }
}

describe('myqth2(新しい MyQTH。試験中)', () => {
  it('ルートは /myqth2/ を取りに行く', async () => {
    const { fetched } = await call('https://myqth2.sotalive.net/', ['/myqth2/'])
    expect(fetched).toEqual(['/myqth2/'])
  })

  it('アプリ自身のファイル(Vite の assets)は /myqth2 の下', async () => {
    const { response, fetched } = await call('https://myqth2.sotalive.net/assets/index-abc.js', ['/myqth2/assets/index-abc.js'])
    expect(fetched).toEqual(['/myqth2/assets/index-abc.js'])
    expect(response.status).toBe(200)
  })

  it('アプリにないファビコンは、共通アセットの favicon/ から', async () => {
    const { response, fetched } = await call('https://myqth2.sotalive.net/favicon-32x32-qth.png', [
      '/shared/common/favicon/favicon-32x32-qth.png',
    ])
    expect(fetched).toEqual(['/myqth2/favicon-32x32-qth.png', '/shared/common/favicon/favicon-32x32-qth.png'])
    expect(response.status).toBe(200)
  })

  it('検索エンジンに載せない(noindex)', async () => {
    const { response } = await call('https://myqth2.sotalive.net/', ['/myqth2/'])
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('myqth.sotalive.net(本番。別のプロジェクト)は、振り分けない', async () => {
    const { fetched } = await call('https://myqth.sotalive.net/', ['/'])
    expect(fetched).toEqual(['/'])
  })
})

describe('これまでの振り分けは変わらない', () => {
  it('myact2 は /myact2。noindex', async () => {
    const { response, fetched } = await call('https://myact2.sotalive.net/', ['/myact2/'])
    expect(fetched).toEqual(['/myact2/'])
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('myact2 のアプリにないファイルは、共通アセットから(404 のフォールバック)', async () => {
    const { fetched } = await call('https://myact2.sotalive.net/json/x.json', ['/shared/common/json/x.json'])
    expect(fetched).toEqual(['/myact2/json/x.json', '/shared/common/json/x.json'])
  })

  it('サブドメインなし(sotalive.pages.dev)は、そのまま配信する', async () => {
    const { fetched } = await call('https://sotalive.pages.dev/myact2/', ['/myact2/'])
    expect(fetched).toEqual(['/myact2/'])
  })

  it('/api/ はバックエンドへ中継する(X-Forwarded-Host に元のホスト名)', async () => {
    const seen: { url: string; host: string | null }[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), host: new Headers(init?.headers).get('x-forwarded-host') })
      return new Response('{}')
    }) as typeof fetch
    try {
      await call('https://myqth2.sotalive.net/api/v2/locator/jcc-jcg?lat=1&lon=2')
    } finally {
      globalThis.fetch = realFetch
    }
    expect(seen).toEqual([{ url: 'https://sotaapp2.sotalive.net/api/v2/locator/jcc-jcg?lat=1&lon=2', host: 'myqth2.sotalive.net' }])
  })

  it('logconv は、専用のプロジェクト(pages/logconv)へ移した。ここでは振り分けない', async () => {
    const { fetched } = await call('https://logconv2.sotalive.net/', ['/'])
    expect(fetched).toEqual(['/'])
  })
})
