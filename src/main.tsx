import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initDebugFlags } from './engine/debugFlags';
import { initLighting } from './engine/lighting';
import { initPerfTier } from './engine/lighting/perfTier';
import { initBrightness } from './engine/lighting/brightness';
import { initPhotosensitivity } from './engine/lighting/photosensitivity';
import { safeStorage } from './storage';
import './i18n';
import App from './App'
import './index.css'
import './components/shared.css'

initDebugFlags(window.location.search);
initLighting(window.location.search);
initPerfTier(window.location.search);
initBrightness(window.location.search);
initPhotosensitivity(window.location.search);
// Orphaned key from the removed outline-style toggle. One-shot cleanup so the
// per-user localStorage doesn't accumulate dead values across deploys.
safeStorage.remove('carrotroyale_outline_style');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
