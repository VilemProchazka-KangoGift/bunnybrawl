import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '/logo.png?url': new URL('./src/test/logo-stub.ts', import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/__tests__/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts'],
      exclude: ['src/engine/**/index.ts', 'src/engine/rendering/**', 'src/engine/themes/drawPrimitives.ts', 'src/engine/arenas/packs/**', 'src/engine/characters/packs/**'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
})
