/**
 * Sim-in-worker mode — the worker hosts the full GameLoop (Simulator +
 * ParticleSystem + cosmetic systems + Renderer). Main becomes a thin shell
 * forwarding keyboard/touch inputs and dispatching SFX / match-end /
 * phase-change events posted back from the worker.
 *
 * Distinct from the renderer-only `worker` flag (workerFlag.ts):
 *   ?simWorker=on (default ON)     — renderer + sim in worker (this flag)
 *   ?worker=on    (default ON)     — renderer in worker, sim on main
 *   ?simWorker=off                 — sim falls back to renderer-only worker
 *   ?worker=off                    — both on main (capability fallback)
 *
 * Default flipped to ON 2026-05-11 after a 4× CPU-throttle bench showed
 * main-thread profile time drop from 2,590 ms to 716 ms (-72%) on
 * castle/4-bot/30s. Online play also runs through this path — the Phase 2
 * netmatch-async refactor (PR #38) wired `EngineWorkerProxy` as
 * `NetMatchDriver.injectedDriver` so host/guest loops drive the
 * worker-hosted sim asynchronously.
 */

import { createUrlStoredEmitter, BOOL_ON_OFF } from '../urlStoredEmitter';

const emitter = createUrlStoredEmitter<boolean>({
  storageKey: 'carrotroyale_sim_worker',
  paramName: 'simWorker',
  defaultValue: true,
  ...BOOL_ON_OFF,
});

export const isSimWorkerEnabled = emitter.get;
export const subscribeSimWorkerFlag = emitter.subscribe;
export const setSimWorkerEnabled = emitter.set;
export const initSimWorker = emitter.init;
