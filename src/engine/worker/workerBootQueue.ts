/**
 * Boot-handshake workaround for Vite dev's module-worker quirk: messages
 * posted before the worker finishes evaluating its top-level code can be
 * dropped (the HTML spec requires queuing; module-worker dev mode doesn't
 * deliver on it). The worker posts `worker:bootReady` once its message
 * listener is attached; we buffer outbound calls until then.
 *
 * Usage:
 *   const bootQueue = installWorkerBootQueue(worker);
 *   // ...
 *   if (msg.type === 'worker:bootReady') bootQueue.release();
 *
 * Once released, the original `postMessage` is restored so hot paths
 * (input batches / renderFrame at 60Hz) don't pay the wrapper branch.
 *
 * Bounded buffer: drops oldest queued entries past `MAX_QUEUED`. A silently
 * wedged worker (never sends `bootReady`) would otherwise leak per-frame
 * MatchState clones forever.
 */

/** Cap chosen empirically. Dev-mode boot is <100ms; prod-build boot of the
 *  ~500KB renderWorker bundle can take 1-2s on cold-cache mid-tier hardware,
 *  during which `RendererProxy` queues `host:renderFrame` at 60Hz. 600
 *  entries buys ~10s of 60Hz traffic — comfortably past any realistic boot
 *  delay, while still tripping the wedged-worker fail-safe. Combined with
 *  the renderFrame-preferential drop policy below, even an 11s boot won't
 *  cost us the (irreplaceable) `host:init` message. */
const MAX_QUEUED = 600;

export interface WorkerBootQueue {
  /** Flush queued messages to the worker in order, then restore native
   *  `postMessage`. Idempotent — safe to call multiple times. */
  release(): void;
}

export function installWorkerBootQueue(worker: Worker): WorkerBootQueue {
  const orig = worker.postMessage.bind(worker);
  const queue: Array<{ msg: unknown; transfer: Transferable[] }> = [];
  let droppedCount = 0;

  worker.postMessage = ((msg: unknown, transfer?: Transferable[]): void => {
    if (queue.length >= MAX_QUEUED) {
      // Prefer dropping the oldest `host:renderFrame` — those are stale per-frame
      // state that the next renderFrame will supersede anyway. Setup messages
      // (`host:init`, `host:renderBackground`, `host:setRenderScale`, …) are
      // one-shot and irreplaceable; losing `host:init` leaves the worker
      // forever without a Renderer and silently black-screens the canvas. If
      // somehow the queue has no renderFrames (shouldn't happen — they
      // dominate at 60Hz), fall through and shift the absolute oldest.
      let idx = -1;
      for (let i = 0; i < queue.length; i++) {
        if ((queue[i].msg as { type?: string }).type === 'host:renderFrame') { idx = i; break; }
      }
      if (idx < 0) idx = 0;
      queue.splice(idx, 1);
      droppedCount++;
      if (droppedCount === 1) {
        console.warn('[workerBootQueue] worker:bootReady not received yet; dropping oldest queued renderFrame messages');
      }
    }
    queue.push({ msg, transfer: transfer ?? [] });
  }) as Worker['postMessage'];

  return {
    release(): void {
      if (worker.postMessage === orig) return;
      worker.postMessage = orig;
      for (const { msg, transfer } of queue) {
        if (transfer.length > 0) orig(msg, transfer);
        else orig(msg);
      }
      queue.length = 0;
    },
  };
}
