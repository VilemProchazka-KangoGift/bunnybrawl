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

/** Sim-in-worker mode (?simWorker=on) hosts the entire GameLoop inside the
 *  worker. Several modules GameLoop depends on are main-thread-only:
 *    - audio (Howler) → posts SFX events to main
 *    - haptics (Vibration API) → posts haptic events to main
 *    - KeyboardManager (window listeners) → no-op; inputs come via wire
 *    - touchDetect (matchMedia) → stub returns false
 *  The renderer-only worker path doesn't import any of these (Renderer
 *  alone), so the renderer-only path is unaffected by these aliases —
 *  they only matter if the worker module graph imports them. */
const audioStubPath = path.resolve(__dirname, 'src/engine/worker/stubs/audio-worker-stub.ts')
const hapticsStubPath = path.resolve(__dirname, 'src/engine/worker/stubs/haptics-worker-stub.ts')
const keyboardManagerStubPath = path.resolve(__dirname, 'src/engine/worker/stubs/keyboardManager-worker-stub.ts')
const touchDetectStubPath = path.resolve(__dirname, 'src/engine/worker/stubs/touchDetect-worker-stub.ts')

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
      name: 'worker-module-stubs',
      enforce: 'pre',
      resolveId(id: string, importer?: string) {
        if (id === 'howler') return howlerStubPath
        // Tail-match the relative imports because the same module is
        // imported with different relative paths from different files.
        // Order: longest match first (e.g. ../../audio before ../audio).
        if (!importer) return null
        if (id.endsWith('/audio') || id.endsWith('/audio/index') || id === '../audio' || id === '../../audio') return audioStubPath
        if (id.endsWith('/haptics') || id === '../haptics' || id === '../../haptics') return hapticsStubPath
        if (id.endsWith('/input/KeyboardManager') || id === '../input/KeyboardManager' || id === '../../input/KeyboardManager') return keyboardManagerStubPath
        if (id.endsWith('/touchDetect') || id === '../touchDetect' || id === '../../touchDetect') return touchDetectStubPath
        return null
      },
    }],
  },
})
