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

/** Cap chosen empirically: dev-mode boot is <100ms, so 120 entries buys
 *  ~2s of 60Hz traffic before the queue starts dropping. Real boot lands
 *  well inside that budget; only a silently-wedged worker hits the cap. */
const MAX_QUEUED = 120;

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
      queue.shift();
      droppedCount++;
      if (droppedCount === 1) {
        console.warn('[workerBootQueue] worker:bootReady not received yet; dropping oldest queued messages');
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
