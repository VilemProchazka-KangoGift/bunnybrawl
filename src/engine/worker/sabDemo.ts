/** SAB hello-world entry point. Gated behind `?sabDemo` URL param in
 *  main.tsx. If `crossOriginIsolated` is true, allocates a tiny shared
 *  Int32Array, hands the underlying SAB to the demo worker, and both sides
 *  bump counters via Atomics.add. Main logs a summary after 1s.
 *
 *  Purpose: prove the COOP/COEP + SAB + Atomics foundation works locally
 *  before any sim-state migration. Step 1 of the SAB exploration roadmap. */

export function startSabDemo(): void {
  if (!crossOriginIsolated) {
    console.warn('[sabDemo] crossOriginIsolated=false — SAB unavailable. Skipping.');
    return;
  }
  if (typeof SharedArrayBuffer === 'undefined') {
    console.warn('[sabDemo] SharedArrayBuffer not defined. Skipping.');
    return;
  }

  const sab = new SharedArrayBuffer(8); // 2 × Int32
  const view = new Int32Array(sab);

  const worker = new Worker(new URL('./sabDemo.worker.ts', import.meta.url), {
    type: 'module',
    name: 'sab-demo',
  });

  worker.onmessage = (e: MessageEvent<{ type: string }>): void => {
    if (e.data.type !== 'ready') return;
    const start = performance.now();
    const tick = (): void => {
      Atomics.add(view, 0, 1);
      if (performance.now() - start < 1000) requestAnimationFrame(tick);
      else {
        const mainTicks = Atomics.load(view, 0);
        const workerTicks = Atomics.load(view, 1);
        console.info(
          `[sabDemo] 1s elapsed — main=${mainTicks} ticks, worker=${workerTicks} ticks (shared via Atomics)`,
        );
        worker.terminate();
      }
    };
    tick();
  };

  worker.postMessage({ type: 'init', sab });
}
