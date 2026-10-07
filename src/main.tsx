import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initDebugFlags } from './engine/debugFlags';
import { initLighting } from './engine/lighting';
import { initPerfTier } from './engine/lighting/perfTier';
import { initBrightness } from './engine/lighting/brightness';
import { initPhotosensitivity } from './engine/lighting/photosensitivity';
import { initInputEcho } from './engine/net/inputEchoFlag';
import { initTurn } from './engine/net/turnFlag';
import { initNetSimFlags } from './engine/net/netSimFlags';
import { initSimWorker } from './engine/worker/simWorkerFlag';
import { safeStorage } from './storage';
import './i18n';
import App from './App'
import { CrashGuard } from './components/CrashGuard'
import './index.css'
import './components/shared.css'
import './components/saturday.css'

const _search = window.location.search;
initDebugFlags(_search);
// COOP/COEP set in vite.config.ts gates `crossOriginIsolated`, which is the
// prereq for SharedArrayBuffer + Atomics. GitHub Pages can't set those
// headers, so prod will report false here and SAB-gated paths must check
// `crossOriginIsolated` at runtime. Logged once at boot so the foundation
// is visible without a devtools dive.
console.info(
  '[boot] crossOriginIsolated=' + crossOriginIsolated
  + ' SharedArrayBuffer=' + (typeof SharedArrayBuffer !== 'undefined'),
);
initLighting(_search);
initPerfTier(_search);
initBrightness(_search);
initPhotosensitivity(_search);
initInputEcho(_search);
initTurn(_search);
initNetSimFlags(_search);
initSimWorker(_search);
// Orphaned keys from removed flags. One-shot cleanup so the per-user
// localStorage doesn't accumulate dead values across deploys.
safeStorage.remove('carrotroyale_outline_style');
safeStorage.remove('carrotroyale_sab_demo');

function mountApp(): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <CrashGuard>
        <App />
      </CrashGuard>
    </StrictMode>,
  )
}

if (new URLSearchParams(_search).get('pocketBunny') === '1') {
  import('./engine/characters/prototypes/pocketBunnyRig')
    .then(({ registerPocketBunnyRig }) => registerPocketBunnyRig())
    .then(mountApp)
    .catch((error: unknown) => {
      console.error('Pocket Plush Bunny playtest failed to load', error)
      const loading = document.getElementById('loading-screen')
      if (loading) loading.textContent = 'Pocket Plush Bunny failed to load. Check the console and refresh.'
    })
} else {
  mountApp()
}
