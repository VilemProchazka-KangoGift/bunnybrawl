/**
 * Wire format for postMessage between main thread and the render worker.
 * Kept browser-pure (no DOM imports) so it compiles into both bundles.
 *
 * Message direction is encoded in the type prefix:
 *   `host:*` — main → worker
 *   `worker:*` — worker → main
 */

/** Phase 1 round-trip — worker draws into the transferred canvas. */
export interface HostInitMsg {
  type: 'host:init';
  /** Transferred via postMessage's transfer list. */
  canvas: OffscreenCanvas;
  /** Logical width/height — backing-store dims live on the canvas object. */
  width: number;
  height: number;
}

export interface HostStopMsg {
  type: 'host:stop';
}

/** Worker has wired itself up and is ticking RAF. */
export interface WorkerReadyMsg {
  type: 'worker:ready';
}

/** Worker fault — main side should fall back to the off-worker path. */
export interface WorkerErrorMsg {
  type: 'worker:error';
  message: string;
}

export type HostToWorkerMsg = HostInitMsg | HostStopMsg;
export type WorkerToHostMsg = WorkerReadyMsg | WorkerErrorMsg;
