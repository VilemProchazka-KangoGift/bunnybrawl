/**
 * Main-thread side of the render worker — owns the Worker handle and the
 * postMessage bridge. Phase 1 scope: spin up worker, transfer one canvas,
 * receive ready/error events, terminate cleanly.
 */

import type { HostInitMsg, HostStopMsg, WorkerToHostMsg } from './messages';

export interface WorkerHostEvents {
  onReady?: () => void;
  onError?: (message: string) => void;
}

export class WorkerHost {
  private worker: Worker;
  private events: WorkerHostEvents;
  private destroyed = false;

  constructor(events: WorkerHostEvents = {}) {
    this.events = events;
    this.worker = new Worker(
      new URL('./renderWorker.ts', import.meta.url),
      { type: 'module', name: 'carrot-royale-render' },
    );
    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', this.handleErrorEvent);
    this.worker.addEventListener('messageerror', this.handleMessageError);
  }

  /**
   * Hand a DOM canvas's drawing surface to the worker. After this call the
   * canvas can no longer be drawn from the main thread.
   */
  attachCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
    if (this.destroyed) throw new Error('WorkerHost destroyed');
    const offscreen = canvas.transferControlToOffscreen();
    const msg: HostInitMsg = { type: 'host:init', canvas: offscreen, width, height };
    this.worker.postMessage(msg, [offscreen]);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      const stop: HostStopMsg = { type: 'host:stop' };
      this.worker.postMessage(stop);
    } catch {
      // Worker may already be in a bad state — terminate is the recovery.
    }
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleErrorEvent);
    this.worker.removeEventListener('messageerror', this.handleMessageError);
    this.worker.terminate();
  }

  private handleMessage = (e: MessageEvent<WorkerToHostMsg>): void => {
    const msg = e.data;
    if (msg.type === 'worker:ready') this.events.onReady?.();
    else if (msg.type === 'worker:error') this.events.onError?.(msg.message);
  };

  private handleErrorEvent = (e: ErrorEvent): void => {
    this.events.onError?.(e.message || 'worker error');
  };

  private handleMessageError = (): void => {
    this.events.onError?.('worker structured-clone failed');
  };
}
