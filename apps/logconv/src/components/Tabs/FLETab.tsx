import { ExternalLink } from 'lucide-react'

const FLE_URL = 'https://fleonline.sotalive.net/fle/'

/**
 * FLE Online は独立したアプリになった。旧版の logconv にあった「FLE Online」タブの代わりに、移転先へ案内する
 */
export function FLETab() {
  return (
    <section className="max-w-2xl space-y-4" aria-labelledby="fle-title">
      <h2 id="fle-title" className="text-xl font-bold text-gray-950 dark:text-white">
        FLE Online は移転しました
      </h2>
      <p className="text-gray-800 dark:text-gray-200">
        Fast Log Entry(FLE)形式でログを書いて、ADIF などに変換する FLE Online は、専用のアプリになりました。
        スマホにインストールして、オフラインでも使えます。以下のページを開いてください。
      </p>
      <a
        href={FLE_URL}
        className="inline-flex items-center gap-2 min-h-12 px-5 rounded-lg bg-primary-700 text-white font-bold hover:bg-primary-800"
      >
        FLE Online を開く
        <ExternalLink className="w-5 h-5" aria-hidden="true" />
      </a>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        ブックマークをお持ちの方は、<span className="font-mono">{FLE_URL}</span> に更新してください。
      </p>
    </section>
  )
}
