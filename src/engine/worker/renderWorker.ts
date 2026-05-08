/// <reference lib="webworker" />
/**
 * Render worker entry — Phase 1 round-trip scaffold.
 *
 * This file is the worker's module-graph root. Imports must stay in the
 * "worker-safe" set: no React, no Howler, no Trystero, no i18next, no DOM
 * APIs that aren't available in DedicatedWorkerGlobalScope. The
 * `worker-bundle-no-main-deps.test.ts` regression enforces this.
 *
 * Phase 1 only proves the postMessage + transferControlToOffscreen + RAF
 * path. The actual Renderer migrates in Phase 2.
 */

import type { HostToWorkerMsg, WorkerReadyMsg, WorkerErrorMsg } from './messages';

const ctxScope = self as DedicatedWorkerGlobalScope;

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let rafId = 0;
let stopped = false;

function postReady(): void {
  const msg: WorkerReadyMsg = { type: 'worker:ready' };
  ctxScope.postMessage(msg);
}

function postError(message: string): void {
  const msg: WorkerErrorMsg = { type: 'worker:error', message };
  ctxScope.postMessage(msg);
}

function startDrawLoop(): void {
  const tick = (): void => {
    if (stopped || !ctx || !canvas) return;
    // Phase 1 placeholder paint — proves the canvas was transferred and that
    // the worker's RAF is firing. Real rendering lands in Phase 2.
    const t = performance.now() * 0.001;
    const hue = Math.floor((t * 60) % 360);
    ctx.fillStyle = `hsl(${hue}, 50%, 35%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px sans-serif';
    ctx.fillText('worker render', 20, 40);
    rafId = ctxScope.requestAnimationFrame(tick);
  };
  rafId = ctxScope.requestAnimationFrame(tick);
}

ctxScope.addEventListener('message', (e: MessageEvent<HostToWorkerMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === 'host:init') {
      canvas = msg.canvas;
      const c = canvas.getContext('2d');
      if (!c) throw new Error('getContext("2d") returned null in worker');
      ctx = c;
      stopped = false;
      startDrawLoop();
      postReady();
      return;
    }
    if (msg.type === 'host:stop') {
      stopped = true;
      if (rafId) ctxScope.cancelAnimationFrame(rafId);
      rafId = 0;
      return;
    }
  } catch (err) {
    postError(err instanceof Error ? err.message : String(err));
  }
});

// Default export so Vite's module-worker import treats this as an ES module.
export {};
