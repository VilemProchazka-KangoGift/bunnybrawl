import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Worker-only alias for `howler`. The character packs all `import { Howl }
 *  from 'howler'` to declare their `createSound` factory; that factory is
 *  only ever called from the main-thread AudioManager, but the bare ESM
 *  import still pulls Howler's module-init into the worker bundle — and
 *  that init crashes with `HowlerGlobal is not defined` once it falls
 *  through the worker-context branches. The stub gives the worker bundle
 *  a no-op Howl/Howler so the imports resolve cleanly without dragging in
 *  the real audio runtime. Main bundle keeps the real Howler. */
const howlerStubPath = path.resolve(__dirname, 'src/engine/worker/howlerStub.ts')

export default defineConfig({
  plugins: [react()],
  base: '/bunnybrawl/',
  optimizeDeps: {
    include: ['@trystero-p2p/mqtt'],
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  worker: {
    plugins: () => [{
      name: 'worker-howler-stub',
      enforce: 'pre',
      resolveId(id: string) {
        if (id === 'howler') return howlerStubPath
        return null
      },
    }],
  },
})
