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

/** Map from a real engine module's resolved-absolute path → worker stub.
 *  Resolution is done by joining (importer dir, id) and dropping any `.ts` /
 *  `/index.ts` suffix. This is robust to any relative-path depth (`../audio`,
 *  `../../audio`, `../../../audio`, …) and rejects unrelated modules whose
 *  path happens to end in `/audio` (the previous tail-match heuristic was
 *  brittle to that). */
const STUB_BY_RESOLVED: Record<string, string> = {
  [path.resolve(__dirname, 'src/engine/audio')]: audioStubPath,
  [path.resolve(__dirname, 'src/engine/haptics')]: hapticsStubPath,
  [path.resolve(__dirname, 'src/engine/input/KeyboardManager')]: keyboardManagerStubPath,
  [path.resolve(__dirname, 'src/engine/touchDetect')]: touchDetectStubPath,
}

function stripExt(p: string): string {
  if (p.endsWith('/index.ts') || p.endsWith('\\index.ts')) return p.slice(0, -9)
  if (p.endsWith('.ts')) return p.slice(0, -3)
  return p
}

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
        // In dev, Vite's optimizeDeps rewrites `from 'howler'` in the
        // IMPORTER's transformed source to `/node_modules/.vite/deps/howler.js`
        // BEFORE our resolver sees the bare specifier. The transformed file
        // is cached and shared between main and worker bundles, so the
        // worker imports the prebundled URL too. Intercept that URL here and
        // redirect to the stub. Production builds skip optimizeDeps entirely,
        // so the bare-specifier match alone is sufficient there — but the
        // URL match is harmless in prod (the path doesn't exist) and gives
        // us defense in depth.
        if (id.includes('/.vite/deps/howler.')) return howlerStubPath
        if (!importer || !id.startsWith('.')) return null
        // Resolve the relative import to an absolute path; strip extension
        // + /index suffix so `../audio`, `../audio.ts`, `../audio/index.ts`
        // all collapse to `<root>/src/engine/audio`. Compare against the
        // stub map. Any depth of `../` works.
        const resolved = stripExt(path.resolve(path.dirname(importer), id))
        return STUB_BY_RESOLVED[resolved] ?? null
      },
    }],
  },
})
