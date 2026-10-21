// 変換 API(/api/v2/logconv/*)の呼び出しと、失敗の文言の共通処理

/** 画面にそのまま出せる(日本語の)メッセージを持つ例外 */
export class ConvertError extends Error {}

export const TIMEOUT_MS = 120_000
const TIMEOUT_MESSAGE = '時間がかかりすぎています。ファイルを分けて試してください'
const NETWORK_MESSAGE = 'サーバーに接続できませんでした。通信を確かめてください'
const TOO_LARGE_MESSAGE = 'ファイルが大きすぎます(上限 8MB)'

/** fetch に時間切れをつける。応答が返らなければ中断して ConvertError にする */
export async function fetchWithTimeout(url: string, init: RequestInit, ms = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new ConvertError(TIMEOUT_MESSAGE))
    }, ms)
  })
  try {
    return await Promise.race([fetch(url, { ...init, signal: controller.signal }), timeout])
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new ConvertError(TIMEOUT_MESSAGE)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** 例外を、画面に出す日本語のメッセージにする */
export function errorMessage(err: unknown): string {
  if (err instanceof ConvertError) return err.message
  if (err instanceof TypeError) return NETWORK_MESSAGE
  if (err instanceof Error) return err.message
  return 'エラーが発生しました'
}

/** 失敗した応答の理由の一覧(error_log、なければ error) */
export async function failureReasons(response: Response, useError = true): Promise<string[]> {
  const body = await response.json().catch(() => null)
  if (Array.isArray(body?.error_log) && body.error_log.length > 0) return body.error_log.map(String)
  if (useError && typeof body?.error === 'string' && body.error) return [body.error]
  return []
}

/** 失敗した応答を、例外にする。413 は上限、400 は理由を出す */
export async function throwFailure(response: Response, fallback: string, useError = true): Promise<never> {
  if (response.status === 413) throw new ConvertError(`${fallback}: ${TOO_LARGE_MESSAGE}`)
  const reasons = await failureReasons(response, useError && response.status === 400)
  throw new ConvertError(reasons.length ? `${fallback}: ${reasons.join(' / ')}` : fallback)
}

const REASONS_JA: [RegExp, string][] = [
  [/No SOTA references/i, '変換できるSOTAの交信が見つかりません(山岳IDの指定とログを確かめてください)'],
  [/No .*references/i, '変換できる交信が見つかりません(リファレンスの指定とログを確かめてください)'],
]

/** 200 の応答の中身を ZIP として保存する。JSON(理由)が返ったときは保存せず、例外にする */
export async function saveZip(response: Response, filename: string): Promise<void> {
  const blob = await response.blob()
  const type = `${response.headers?.get?.('content-type') ?? ''} ${blob.type}`
  if (/json/i.test(type)) {
    let reason = ''
    try {
      const body = JSON.parse(await blob.text())
      reason = String(body?.error ?? body?.error_log?.join?.(' / ') ?? '')
    } catch {
      // 中身が読めなくても、保存はしない
    }
    const ja = REASONS_JA.find(([re]) => re.test(reason))?.[1]
    throw new ConvertError(ja ?? `変換できませんでした${reason ? `: ${reason}` : '(結果のファイルがありません)'}`)
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
