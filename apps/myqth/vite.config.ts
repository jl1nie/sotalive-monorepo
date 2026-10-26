import { defineConfig } from 'vitest/config'

// myqth2.sotalive.net(プロジェクト sotalive。functions/_middleware.ts が /myqth2 に振り分ける)でも、
// 切り替えたあとの myqth.sotalive.net(静的なプロジェクト)でも、ルートに置く
export default defineConfig({
  base: '/',
  build: { target: 'es2020' },
  test: { include: ['src/**/*.test.ts'] },
})
