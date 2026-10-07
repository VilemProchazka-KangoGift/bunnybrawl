import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineWorkerProxy } from '../EngineWorkerProxy';
import { registerBuiltinArenas } from '../../arenas/builtin';
import { registerBuiltinCharacters } from '../../characters/builtin';
import { makeArena, makeSettings } from '../../__tests__/testHelpers';
import type { HostToWorkerMsg } from '../messages';
import type { InputState, PlayerSlot } from '../../types';
import { readSlotInput } from '../sabInput';

vi.mock('../../audio', () => ({ audio: { stopAllGameSounds: vi.fn(), setPaused: vi.fn() } }));

/** Mock only the browser worker boundary; exercise the real proxy, keyboard
 * listeners and SAB path without rendering or audio. Structured clone matters:
 * retaining producer scratch references would hide delivery bugs. */
class FakeWorker {
  static latest: FakeWorker;
  messages: HostToWorkerMsg[] = [];
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  constructor() { FakeWorker.latest = this; }
  postMessage(message: HostToWorkerMsg): void { this.messages.push(structuredClone(message)); }
  addEventListener(type: string, fn: (event: MessageEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set(); set.add(fn); this.listeners.set(type, set);
  }
  removeEventListener(type: string, fn: (event: MessageEvent) => void): void { this.listeners.get(type)?.delete(fn); }
  terminate(): void {}
  boot(): void { for (const fn of this.listeners.get('message') ?? []) fn({ data: { type: 'worker:bootReady' } } as MessageEvent); }
}

const neutral: InputState = { left: false, right: false, jump: false, down: false };
beforeAll(() => { registerBuiltinArenas(); registerBuiltinCharacters(); });

describe('EngineWorkerProxy input ownership', () => {
  let proxy: EngineWorkerProxy;
  let frames: FrameRequestCallback[];
  beforeEach(() => {
    frames = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('crossOriginIsolated', false);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => { proxy?.stop(); vi.unstubAllGlobals(); });
  function create(sab = false): FakeWorker {
    vi.stubGlobal('crossOriginIsolated', sab);
    const canvas = { transferControlToOffscreen: () => ({}) } as HTMLCanvasElement;
    proxy = new EngineWorkerProxy({ bgCanvas: canvas, fgCanvas: canvas, arena: makeArena(), settings: makeSettings(), activePlayers: ['P1'], onMatchEnd: vi.fn(), renderScale: 1 });
    const worker = FakeWorker.latest;
    worker.boot(); proxy.start(); worker.messages.length = 0;
    return worker;
  }
  function batch(worker: FakeWorker) { return worker.messages.filter(m => m.type === 'host:engineInputBatch'); }

  it('sends keyboard changes immediately without executing a main RAF', () => {
    const worker = create();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    expect(batch(worker).at(-1)?.inputs[0][1].right).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' }));
    expect(batch(worker).at(-1)?.inputs[0][1].right).toBe(false);
    expect(frames).toHaveLength(1);
  });

  for (const sab of [false, true]) {
    it('discards queued jumps and publishes paused releases before resume (SAB=' + sab + ')', () => {
      const worker = create(sab);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
      proxy.pause();
      if (sab) {
        const view = (proxy as unknown as { inputSabView: Int32Array }).inputSabView;
        const out = { ...neutral };
        readSlotInput(view, 0, out);
        expect(out).toEqual({ ...neutral, right: true });
      }
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
      worker.messages.length = 0;
      proxy.resume();
      if (sab) {
        const view = (proxy as unknown as { inputSabView: Int32Array }).inputSabView;
        const out = { ...neutral };
        readSlotInput(view, 0, out);
        expect(out).toEqual(neutral);
      } else {
        expect(worker.messages[0]).toMatchObject({ type: 'host:engineInputBatch', inputs: [['P1', neutral]] });
      }
      expect(worker.messages.at(-1)?.type).toBe('host:engineResume');
    });

    for (const mode of ['host', 'guest'] as const) {
      it(mode + ' getInputAny exclusively owns quick jump taps (SAB=' + sab + ')', () => {
        const worker = create(sab);
        proxy.setNetMode(mode); worker.messages.length = 0;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp' }));
        frames.shift()!(16);
        expect(batch(worker)).toHaveLength(0);
        expect(proxy.getInputAny().jump).toBe(true);
        expect(proxy.getInputAny().jump).toBe(false);
      });
    }
  }

  it('forwards two identical jump submissions instead of deduplicating the second press', () => {
    const worker = create(); proxy.setNetMode('host'); worker.messages.length = 0;
    const input = new Map<PlayerSlot, InputState>([['P1', { ...neutral, jump: true }]]);
    proxy.postInputBatch(input); proxy.postInputBatch(input);
    expect(batch(worker)).toHaveLength(2);
  });

  it('compares slot identity when a reconnect changes the batch without changing levels', () => {
    const worker = create(); proxy.setNetMode('host'); worker.messages.length = 0;
    proxy.postInputBatch(new Map([['P2', neutral]]));
    proxy.postInputBatch(new Map([['P3', neutral]]));
    expect(batch(worker).at(-1)?.inputs[0][0]).toBe('P3');
    expect(batch(worker)).toHaveLength(2);
  });

  it('writes a local quick tap to shared memory before main RAF and retains it through release', () => {
    const worker = create(true);
    const view = (proxy as unknown as { inputSabView: Int32Array }).inputSabView;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
    const out = { ...neutral };
    readSlotInput(view, 0, out);
    expect(out.jump).toBe(true);
    readSlotInput(view, 0, out);
    expect(out.jump).toBe(false);
    expect(batch(worker)).toHaveLength(0);
  });
});
