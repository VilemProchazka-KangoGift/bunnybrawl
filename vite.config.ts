import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Worker-only alias for `howler` — defense in depth. Since the
 *  `characters/builtinSounds.ts` split, no worker-bound module imports
 *  `howler` (visual packs no longer carry `createSound`). The alias
 *  remains so that any future stray import is silently neutralized
 *  rather than crashing the worker with `HowlerGlobal is not defined`. */
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
  // (Removed: `audio/howlShim` alias. The shim file is gone — character
  // voice factories live in `characters/builtinSounds.ts`, imported only
  // by App.tsx on main, never reached from the worker bundle.)
}

function stripExt(p: string): string {
  if (p.endsWith('/index.ts') || p.endsWith('\\index.ts')) return p.slice(0, -9)
  if (p.endsWith('.ts')) return p.slice(0, -3)
  return p
}

/** Apply the worker module-stub aliases. Same function used in both the
 *  top-level `plugins:` (for dev) and `worker.plugins:` (for prod rollup).
 *  In dev, Vite tags worker-context imports with a `?worker_file` query
 *  suffix on the importer URL — we scope the alias to those only so main-
 *  thread imports of `howler` / `audio` / etc. still resolve normally. */
function resolveWorkerStub(id: string, importer: string | undefined, isWorkerContext: boolean): string | null {
  if (!isWorkerContext) return null
  if (id === 'howler') return howlerStubPath
  if (id.includes('/.vite/deps/howler.')) return howlerStubPath
  if (!importer || !id.startsWith('.')) return null
  // Strip query suffix before path-resolving the importer
  const importerPath = importer.split('?')[0]
  const resolved = stripExt(path.resolve(path.dirname(importerPath), id))
  return STUB_BY_RESOLVED[resolved] ?? null
}

export default defineConfig({
  plugins: [
    react(),
    {
      // Dev server applies top-level plugins to ALL transforms, including
      // worker files. `worker.plugins` is only applied during rollup
      // builds — it's effectively dead code in dev. So the worker-stub
      // alias has to live here too, scoped by importer query suffix.
      name: 'worker-module-stubs-dev',
      enforce: 'pre',
      resolveId(id: string, importer?: string) {
        return resolveWorkerStub(id, importer, !!importer && importer.includes('?worker_file'))
      },
    },
  ],
  base: '/bunnybrawl/',
  // COOP/COEP headers in dev + preview unlock `crossOriginIsolated === true`,
  // which is the gate for SharedArrayBuffer + Atomics.wait/notify. Step 1 of
  // the SAB experimentation roadmap: confirm the foundation works locally
  // before any production hosting work. GitHub Pages can't set these
  // headers, so SAB-gated code paths must check `crossOriginIsolated` at
  // runtime and fall back. Side effect: cross-origin iframes / scripts
  // without CORP get blocked — none in this app today, but flagging for
  // future third-party integrations.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    include: ['@trystero-p2p/mqtt'],
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  worker: {
    // Production rollup respects this plugin chain. In dev, the top-level
    // `plugins:` entry above does the equivalent work scoped by importer
    // query suffix.
    plugins: () => [{
      name: 'worker-module-stubs',
      enforce: 'pre',
      resolveId(id: string, importer?: string) {
        // For prod builds, EVERY resolveId call inside the worker bundle
        // is in worker context, so we pass `true` unconditionally.
        return resolveWorkerStub(id, importer, true)
      },
    }],
  },
})
