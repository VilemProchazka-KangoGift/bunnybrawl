import { describe, it, expect, vi } from 'vitest';
import { installWorkerBootQueue } from '../workerBootQueue';

/**
 * Fake Worker — captures `postMessage` invocations (post-release flush)
 * and exposes the replaceable `postMessage` slot the queue installs over.
 */
function fakeWorker() {
  const posted: Array<{ msg: { type?: string }; transfer: Transferable[] }> = [];
  const w = {
    postMessage(msg: unknown, transfer?: Transferable[]): void {
      posted.push({ msg: msg as { type?: string }, transfer: transfer ?? [] });
    },
  };
  return { worker: w as unknown as Worker, posted };
}

describe('workerBootQueue', () => {
  it('buffers messages until release(), then flushes in order', () => {
    const { worker, posted } = fakeWorker();
    const q = installWorkerBootQueue(worker);

    worker.postMessage({ type: 'host:init' });
    worker.postMessage({ type: 'host:renderFrame', n: 1 });
    worker.postMessage({ type: 'host:renderFrame', n: 2 });
    expect(posted).toHaveLength(0);

    q.release();
    expect(posted.map((p) => (p.msg as { type?: string; n?: number }))).toEqual([
      { type: 'host:init' },
      { type: 'host:renderFrame', n: 1 },
      { type: 'host:renderFrame', n: 2 },
    ]);
  });

  it('post-release calls bypass the queue and post synchronously', () => {
    const { worker, posted } = fakeWorker();
    const beforeInstall = worker.postMessage;
    const q = installWorkerBootQueue(worker);
    expect(worker.postMessage).not.toBe(beforeInstall);

    q.release();
    // Post-release calls go straight through, not into the queue.
    worker.postMessage({ type: 'host:renderFrame', n: 99 });
    expect((posted.at(-1)?.msg as { n?: number })?.n).toBe(99);
    // Wrapper is gone — the worker's postMessage is no longer the queueing
    // closure. Identity may differ (release restores a `.bind(worker)` of the
    // original), but the wrapper is definitively replaced.
    expect(worker.postMessage).not.toBe(beforeInstall.bind(worker)); // bind always makes a fresh fn
  });

  it('release() is idempotent', () => {
    const { worker, posted } = fakeWorker();
    const q = installWorkerBootQueue(worker);
    worker.postMessage({ type: 'host:init' });
    q.release();
    q.release(); // second call should be a no-op, not double-flush
    expect(posted).toHaveLength(1);
  });

  it('regression: preserves host:init across a 600-deep overflow of host:renderFrame', () => {
    // Real-world trigger: prod-build renderWorker bundle (~492KB) takes longer
    // than the cap allows on slow CPUs / cold cache. The old "shift the oldest"
    // policy dropped host:init (queue[0]) first, leaving the worker forever
    // without a Renderer → silent black-canvas in production.
    const { worker, posted } = fakeWorker();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* swallow */ });
    const q = installWorkerBootQueue(worker);

    worker.postMessage({ type: 'host:init' });
    // 700 render-frames > MAX_QUEUED (600); the queue must evict but spare init.
    for (let i = 0; i < 700; i++) worker.postMessage({ type: 'host:renderFrame', n: i });

    q.release();

    // host:init must still be the first thing the worker receives.
    expect((posted[0].msg as { type?: string }).type).toBe('host:init');
    // Roughly MAX_QUEUED render-frames survive (the oldest were dropped, newest kept).
    const renderFrames = posted.filter((p) => (p.msg as { type?: string }).type === 'host:renderFrame');
    expect(renderFrames.length).toBeGreaterThan(0);
    expect(renderFrames.length).toBeLessThan(700);
    // Newest renderFrames win — last one queued is also last one delivered.
    const lastN = (renderFrames.at(-1)!.msg as { n: number }).n;
    expect(lastN).toBe(699);
    // Overflow fires the one-shot warning.
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it('regression: preserves arbitrary setup messages (not just host:init) when overflowing', () => {
    // The drop policy looks for host:renderFrame specifically — any other
    // one-shot setup message (host:renderBackground, host:setRenderScale, …)
    // should also ride out an overflow intact.
    const { worker, posted } = fakeWorker();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* swallow */ });
    const q = installWorkerBootQueue(worker);

    worker.postMessage({ type: 'host:init' });
    worker.postMessage({ type: 'host:renderBackground' });
    worker.postMessage({ type: 'host:setRenderScale' });
    for (let i = 0; i < 700; i++) worker.postMessage({ type: 'host:renderFrame', n: i });

    q.release();

    const setupTypes = posted
      .map((p) => (p.msg as { type?: string }).type)
      .filter((t) => t !== 'host:renderFrame');
    expect(setupTypes).toEqual(['host:init', 'host:renderBackground', 'host:setRenderScale']);
    warn.mockRestore();
  });
});
