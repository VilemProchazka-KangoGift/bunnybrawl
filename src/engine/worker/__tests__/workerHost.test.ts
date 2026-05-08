/**
 * Unit tests for the main-thread WorkerHost — verifies the postMessage
 * protocol, transferControlToOffscreen wiring, and dispose semantics.
 * Worker is mocked; the actual renderWorker module is exercised by E2E.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HostInitMsg } from '../messages';

interface CapturedPost {
  msg: unknown;
  transfer: Transferable[] | undefined;
}

class MockWorker {
  static instances: MockWorker[] = [];
  posted: CapturedPost[] = [];
  terminated = false;
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  constructor(_url: string | URL, _opts?: WorkerOptions) {
    MockWorker.instances.push(this);
  }
  postMessage(msg: unknown, transfer?: Transferable[]): void {
    this.posted.push({ msg, transfer });
  }
  terminate(): void { this.terminated = true; }
  addEventListener(type: string, fn: EventListenerOrEventListenerObject): void {
    let s = this.listeners.get(type);
    if (!s) { s = new Set(); this.listeners.set(type, s); }
    s.add(fn);
  }
  removeEventListener(type: string, fn: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(fn);
  }
  fire(type: string, e: Event | MessageEvent | ErrorEvent): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const l of set) {
      if (typeof l === 'function') l(e);
      else l.handleEvent(e);
    }
  }
}

class MockOffscreen {
  width: number;
  height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = {
    width: w,
    height: h,
    transferControlToOffscreen() {
      return new MockOffscreen(this.width, this.height) as unknown as OffscreenCanvas;
    },
  };
  return c as unknown as HTMLCanvasElement;
}

beforeEach(() => {
  MockWorker.instances.length = 0;
  vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WorkerHost', () => {
  it('constructs a module worker with the renderWorker URL', async () => {
    const { WorkerHost } = await import('../workerHost');
    const host = new WorkerHost();
    expect(MockWorker.instances).toHaveLength(1);
    host.destroy();
  });

  it('attachCanvas transfers OffscreenCanvas via host:init', async () => {
    const { WorkerHost } = await import('../workerHost');
    const host = new WorkerHost();
    const w = MockWorker.instances[0];
    host.attachCanvas(makeCanvas(1280, 720), 1280, 720);

    expect(w.posted).toHaveLength(1);
    const init = w.posted[0].msg as HostInitMsg;
    expect(init.type).toBe('host:init');
    expect(init.width).toBe(1280);
    expect(init.height).toBe(720);
    expect((init.canvas as unknown as MockOffscreen).width).toBe(1280);
    expect(w.posted[0].transfer).toHaveLength(1);
    expect(w.posted[0].transfer![0]).toBe(init.canvas);

    host.destroy();
  });

  it('forwards worker:ready events to the host events callback', async () => {
    const { WorkerHost } = await import('../workerHost');
    const onReady = vi.fn();
    const host = new WorkerHost({ onReady });
    const w = MockWorker.instances[0];
    w.fire('message', { data: { type: 'worker:ready' } } as MessageEvent);
    expect(onReady).toHaveBeenCalledOnce();
    host.destroy();
  });

  it('forwards worker:error events to the host events callback', async () => {
    const { WorkerHost } = await import('../workerHost');
    const onError = vi.fn();
    const host = new WorkerHost({ onError });
    const w = MockWorker.instances[0];
    w.fire('message', { data: { type: 'worker:error', message: 'boom' } } as MessageEvent);
    expect(onError).toHaveBeenCalledWith('boom');
    host.destroy();
  });

  it('destroy() posts host:stop and terminates the worker once', async () => {
    const { WorkerHost } = await import('../workerHost');
    const host = new WorkerHost();
    const w = MockWorker.instances[0];
    host.destroy();
    host.destroy(); // idempotent

    const stopMsgs = w.posted.filter((p) => (p.msg as { type: string }).type === 'host:stop');
    expect(stopMsgs).toHaveLength(1);
    expect(w.terminated).toBe(true);
  });

  it('attachCanvas after destroy throws (caller bug)', async () => {
    const { WorkerHost } = await import('../workerHost');
    const host = new WorkerHost();
    host.destroy();
    expect(() => host.attachCanvas(makeCanvas(1280, 720), 1280, 720)).toThrow(/destroyed/);
  });
});
