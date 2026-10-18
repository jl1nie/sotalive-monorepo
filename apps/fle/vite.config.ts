import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { execSync } from 'node:child_process'

// どの版が動いているか確認できるよう、コミットの番号を埋め込む
const appVersion = (() => {
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
      // 新しい版は、入力中に勝手に再読み込みしない。利用者が押したときだけ適用する
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
        // WASM(約1MB)も含めて、オフラインで動くよう事前にキャッシュする
        globPatterns: ['**/*.{js,css,html,wasm,svg,png,webmanifest}'],
        navigateFallback: '/fle/index.html',
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
  },
})
