import path from 'node:path'
import { defineConfig } from 'vitest/config'

// FLE の同期の約束のテストは、アプリ(apps/fle)のコードも読む。アプリと同じく `@/` を apps/fle/src にする
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../apps/fle/src'),
    },
  },
})
