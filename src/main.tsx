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
import { initSabDemo, isSabDemoEnabled } from './engine/worker/sabDemoFlag';
import { safeStorage } from './storage';
import './i18n';
import App from './App'
import './index.css'
import './components/shared.css'

initDebugFlags(window.location.search);
// COOP/COEP set in vite.config.ts gates `crossOriginIsolated`, which is the
// prereq for SharedArrayBuffer + Atomics. GitHub Pages can't set those
// headers, so prod will report false here and SAB-gated paths must check
// `crossOriginIsolated` at runtime. Logged once at boot so the foundation
// is visible without a devtools dive.
console.info(
  '[boot] crossOriginIsolated=' + crossOriginIsolated
  + ' SharedArrayBuffer=' + (typeof SharedArrayBuffer !== 'undefined'),
);
initLighting(window.location.search);
initPerfTier(window.location.search);
initBrightness(window.location.search);
initPhotosensitivity(window.location.search);
initInputEcho(window.location.search);
initTurn(window.location.search);
initNetSimFlags(window.location.search);
initSabDemo(window.location.search);
// Orphaned key from the removed outline-style toggle. One-shot cleanup so the
// per-user localStorage doesn't accumulate dead values across deploys.
safeStorage.remove('carrotroyale_outline_style');

if (isSabDemoEnabled()) {
  void import('./engine/worker/sabDemo').then((m) => m.startSabDemo());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
