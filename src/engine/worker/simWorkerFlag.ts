/**
 * Local-device flag for sim-in-worker mode (the more aggressive offload).
 *
 * `?simWorker=on` causes the worker to host not just the Renderer but the
 * entire Simulator + ParticleSystem + cosmetic systems. Main becomes a
 * thin shell forwarding keyboard inputs and dispatching SFX / match-end /
 * phase-change events posted back from the worker.
 *
 * Distinct from the renderer-only `worker` flag (workerFlag.ts):
 *   ?worker=on (default ON)        — renderer in worker, sim on main
 *   ?simWorker=on (default OFF)    — renderer + sim in worker
 *   ?worker=off                    — both on main (safe fallback)
 *
 * Local play only — online play stays on the renderer-only path because
 * NetMatch's host/guest loops drive `gameLoop.fixedUpdate` synchronously
 * and a sim-async refactor of NetMatch is out of scope for this experiment.
 */

import { safeStorage } from '../../storage';
import { createEmitter } from '../emitter';

const STORAGE_KEY = 'carrotroyale_sim_worker';

// `?simWorker=on` is broken on `npm run dev` — module top-level-await
// ordering inside the worker hangs the engine init promise, leaving the
// match stuck on the loading overlay with no console error. Prod build is
// fine. Force-disable in dev so a DevMenu toggle can't soft-brick a
// developer's local session (they can't get back to MainMenu to flip it
// off once the loading overlay is stuck).
export const SIM_WORKER_DEV_BLOCKED: boolean = (() => {
  try { return import.meta.env.DEV; } catch { return false; }
})();

function readInitial(): boolean {
  if (SIM_WORKER_DEV_BLOCKED) return false;
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const v = params.get('simWorker');
      if (v === 'on') return true;
      if (v === 'off') return false;
    } catch { /* sandbox */ }
  }
  const stored = safeStorage.get(STORAGE_KEY);
  return stored === 'on';
}

const emitter = createEmitter<boolean>(readInitial());

export const isSimWorkerEnabled = emitter.get;
export const subscribeSimWorkerFlag = emitter.subscribe;

export function setSimWorkerEnabled(v: boolean): void {
  if (SIM_WORKER_DEV_BLOCKED && v) return;
  if (v === emitter.get()) return;
  emitter.set(v);
  safeStorage.set(STORAGE_KEY, v ? 'on' : 'off');
}
