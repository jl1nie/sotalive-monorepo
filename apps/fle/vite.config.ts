import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { execSync } from 'node:child_process'

// どの版が動いているか確認できるよう、コミットの番号を埋め込む
const appVersion = (() => {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
})()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 再読み込みは自動でしない。画面は常にネットワーク優先で取るので、開き直せば最新になる
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'FLEonline',
        short_name: 'FLEonline',
        description: 'SOTA/POTA の運用ログを、その場で入力・変換する',
        lang: 'ja',
        start_url: '/fle/',
        scope: '/fle/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 画面(HTML)はキャッシュ優先にしない。つながるときは再読み込みで必ず最新が出て、
        // つながらないとき(山頂など)だけ、前回のものを使う。
        // HTML以外(ハッシュ付きのJS・CSS・WASM・アイコン)は、事前にキャッシュしてオフラインで動かす。
        globPatterns: ['**/*.{js,css,wasm,svg,png,webmanifest}'],
        navigateFallback: undefined,
        runtimeCaching: [
          {
            // 画面が読み込んだアセット(ハッシュ付き・不変)は、その場で保存する。
            // 新しい版の事前キャッシュが終わる前に電波が切れても、組み上がるようにするため
            urlPattern: ({ url }) => url.pathname.startsWith('/fle/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fle-assets',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 40 },
            },
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'fle-pages',
              // 電波が弱いときに待たされないよう、3秒でキャッシュに切り替える
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 5 },
            },
          },
        ],
        // 新しい Service Worker はすぐ入れ替える(待たせない)
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  base: '/fle/',
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3003,
    // 本番は Cloudflare Pages の中継(functions/_middleware.ts)が同じ役目をする
    proxy: {
      '/api': { target: 'https://sotaapp2.fly.dev', changeOrigin: true },
    },
  },
})
