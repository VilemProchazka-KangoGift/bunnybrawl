import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReactiveDecorationSystem } from '../ReactiveDecorationSystem';
import {
  registerReactiveKind, _resetReactiveKindsForTest,
  type ReactiveInstance,
} from '../reactiveDecorations';
import { makeArena, makeState, makePlayer } from '../../../__tests__/testHelpers';

vi.mock('../../../perfFlags', () => ({ getSlowDevice: () => false }));

function inst(overrides: Partial<ReactiveInstance> = {}): ReactiveInstance {
  return {
    pos: { x: 100, y: 600 },
    kind: 'test.x',
    seed: 1,
    excitement: 0,
    shakeDecay: 0,
    ...overrides,
  };
}

describe('ReactiveDecorationSystem', () => {
  beforeEach(() => {
    _resetReactiveKindsForTest();
    registerReactiveKind('test.bg', { draw: () => {}, layer: 'background' });
    registerReactiveKind('test.fg', { draw: () => {}, layer: 'foreground' });
    registerReactiveKind('test.fast', { draw: () => {}, layer: 'background', highFrequency: true });
  });

  it('buckets instances into 30Hz vs 60Hz by their registered kind', () => {
    const sys = new ReactiveDecorationSystem(makeState(), makeArena(), () => {});
    sys.setInstances([
      inst({ kind: 'test.bg' }),
      inst({ kind: 'test.fg' }),
      inst({ kind: 'test.fast' }),
    ]);
    expect(sys.getInstances30Hz()).toHaveLength(2);
    expect(sys.getInstances60Hz()).toHaveLength(1);
  });

  it('advances windPhase in fixedUpdate (60Hz) and not in cosmeticUpdate', () => {
    const sys = new ReactiveDecorationSystem(makeState(), makeArena(), () => {});
    const before = sys.getWindPhase();
    sys.fixedUpdate(1 / 60);
    expect(sys.getWindPhase()).toBeGreaterThan(before);

    const after = sys.getWindPhase();
    sys.cosmeticUpdate(1 / 30);
    expect(sys.getWindPhase()).toBe(after); // unchanged by cosmeticUpdate
  });

  it('updates excitement on 30Hz instances during cosmeticUpdate', () => {
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 90, y: 580, width: 28, height: 40 })],
    });
    const sys = new ReactiveDecorationSystem(state, makeArena(), () => {});
    const i = inst({ kind: 'test.bg', proximity: { radius: 60, mode: 'excite', magnitude: 1 } });
    sys.setInstances([i]);
    for (let n = 0; n < 10; n++) sys.cosmeticUpdate(1 / 30);
    expect(i.excitement).toBeGreaterThan(0.5);
  });

  it('updates excitement on 60Hz instances during fixedUpdate, not cosmeticUpdate', () => {
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 90, y: 580, width: 28, height: 40 })],
    });
    const sys = new ReactiveDecorationSystem(state, makeArena(), () => {});
    const i = inst({ kind: 'test.fast', proximity: { radius: 60, mode: 'excite', magnitude: 1 } });
    sys.setInstances([i]);
    for (let n = 0; n < 20; n++) sys.cosmeticUpdate(1 / 30);
    expect(i.excitement).toBe(0); // cosmeticUpdate skipped 60Hz instance
    for (let n = 0; n < 20; n++) sys.fixedUpdate(1 / 60);
    expect(i.excitement).toBeGreaterThan(0.5);
  });

  it('applyStompImpulse sets shakeDecay only on instances inside shakeRadius', () => {
    const sys = new ReactiveDecorationSystem(makeState(), makeArena(), () => {});
    const near = inst({ kind: 'test.bg', pos: { x: 100, y: 600 }, shakeRadius: 80 });
    const far = inst({ kind: 'test.bg', pos: { x: 500, y: 600 }, shakeRadius: 80 });
    sys.setInstances([near, far]);
    sys.applyStompImpulse(120, 600);
    expect(near.shakeDecay).toBe(1);
    expect(far.shakeDecay).toBe(0);
  });

  it('fires burst exactly once per stomp', () => {
    const emit = vi.fn();
    const sys = new ReactiveDecorationSystem(makeState(), makeArena(), emit);
    const i = inst({
      kind: 'test.bg', pos: { x: 100, y: 600 }, shakeRadius: 80,
      burst: { threshold: 0.95, particleKind: 'leaf', count: 5 },
    });
    sys.setInstances([i]);
    sys.applyStompImpulse(100, 600); // shakeDecay = 1, fires burst on rising edge
    sys.cosmeticUpdate(1 / 30); // already above threshold + decaying — no second fire
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('cleanup clears instances and windPhase', () => {
    const sys = new ReactiveDecorationSystem(makeState(), makeArena(), () => {});
    sys.setInstances([inst()]);
    sys.fixedUpdate(1 / 60);
    sys.cleanup();
    expect(sys.getInstances30Hz()).toHaveLength(0);
    expect(sys.getInstances60Hz()).toHaveLength(0);
    expect(sys.getWindPhase()).toBe(0);
  });

  it('exposes a stomp-event callback that GameLoop can wire to TransitionCallbacks', () => {
    const sys = new ReactiveDecorationSystem(makeState(), makeArena(), () => {});
    const cb: (x: number, y: number) => void = sys.applyStompImpulse.bind(sys);
    expect(typeof cb).toBe('function');
    cb(100, 600); // shouldn't throw
  });
});
