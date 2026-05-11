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

import { createUrlStoredEmitter, BOOL_ON_OFF } from '../urlStoredEmitter';

const emitter = createUrlStoredEmitter<boolean>({
  storageKey: 'carrotroyale_sim_worker',
  paramName: 'simWorker',
  defaultValue: false,
  ...BOOL_ON_OFF,
});

export const isSimWorkerEnabled = emitter.get;
export const subscribeSimWorkerFlag = emitter.subscribe;
export const setSimWorkerEnabled = emitter.set;
export const initSimWorker = emitter.init;
