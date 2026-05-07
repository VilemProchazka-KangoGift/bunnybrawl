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
    kind: 'test.bg',
    seed: 1,
    excitement: 0,
    shakeDecay: 0,
    ...overrides,
  };
}

describe('ReactiveDecorationSystem', () => {
  beforeEach(() => {
    _resetReactiveKindsForTest();
    registerReactiveKind('test.bg', { draw: () => {}, layer: 'prePlayer' });
    registerReactiveKind('test.fg', { draw: () => {}, layer: 'postPlayer' });
    registerReactiveKind('test.fast', { draw: () => {}, layer: 'prePlayer', highFrequency: true });
  });

  it('buckets instances by both update frequency and render layer', () => {
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), makeArena(), () => {});
    sys.setInstances([
      inst({ kind: 'test.bg' }),
      inst({ kind: 'test.fg' }),
      inst({ kind: 'test.fast' }),
    ]);
    expect(sys.getInstancesForLayer('prePlayer')).toHaveLength(2); // bg + fast
    expect(sys.getInstancesForLayer('postPlayer')).toHaveLength(1); // fg
  });

  it('advances windPhase in fixedUpdate but not cosmeticUpdate', () => {
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), makeArena(), () => {});
    const before = sys.getWindPhase();
    sys.fixedUpdate(1 / 60);
    expect(sys.getWindPhase()).toBeGreaterThan(before);

    const after = sys.getWindPhase();
    sys.cosmeticUpdate(1 / 30);
    expect(sys.getWindPhase()).toBe(after);
  });

  it('skips windPhase + 60Hz bucket tick while phase=loading', () => {
    const state = makeState({
      phase: 'loading',
      players: [makePlayer({ id: 'P1', x: 90, y: 580, width: 28, height: 40 })],
    });
    const sys = new ReactiveDecorationSystem(state, makeArena(), () => {});
    const i = inst({ kind: 'test.fast', proximity: { radius: 60, mode: 'excite', magnitude: 1 } });
    sys.setInstances([i]);
    for (let n = 0; n < 60; n++) sys.fixedUpdate(1 / 60);
    expect(sys.getWindPhase()).toBe(0);
    expect(i.excitement).toBe(0);
    state.phase = 'playing';
    sys.fixedUpdate(1 / 60);
    expect(sys.getWindPhase()).toBeGreaterThan(0);
    expect(i.excitement).toBeGreaterThan(0);
  });

  it('updates excitement on 30Hz instances during cosmeticUpdate', () => {
    const state = makeState({
      phase: 'playing',
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
      phase: 'playing',
      players: [makePlayer({ id: 'P1', x: 90, y: 580, width: 28, height: 40 })],
    });
    const sys = new ReactiveDecorationSystem(state, makeArena(), () => {});
    const i = inst({ kind: 'test.fast', proximity: { radius: 60, mode: 'excite', magnitude: 1 } });
    sys.setInstances([i]);
    for (let n = 0; n < 20; n++) sys.cosmeticUpdate(1 / 30);
    expect(i.excitement).toBe(0);
    for (let n = 0; n < 20; n++) sys.fixedUpdate(1 / 60);
    expect(i.excitement).toBeGreaterThan(0.5);
  });

  it('nearestDx tracks the actually-nearest live player, not the first', () => {
    const state = makeState({
      phase: 'playing',
      players: [
        makePlayer({ id: 'P1', x: 500, y: 580, width: 28, height: 40 }), // far
        makePlayer({ id: 'P2', x: 110, y: 580, width: 28, height: 40 }), // near
      ],
    });
    const sys = new ReactiveDecorationSystem(state, makeArena(), () => {});
    const i = inst({
      pos: { x: 100, y: 600 },
      kind: 'test.bg',
      proximity: { radius: 200, mode: 'flee', magnitude: 10 },
    });
    sys.setInstances([i]);
    sys.cosmeticUpdate(1 / 30);
    // P2 center is at 110+14 = 124; instance.x=100; dx = 100 - 124 = -24
    expect(i.nearestDx).toBeLessThan(0);
    expect(Math.abs(i.nearestDx!)).toBeLessThan(50); // not P1's far dx (~−414)
  });

  it('freezes nearestDx once nearest player exits the proximity radius', () => {
    // Without this, a player walking past then far past would keep updating
    // nearestDx, snapping bend direction as they cross x=instance.x. With
    // the freeze, direction is locked at the moment of exit and only the
    // magnitude (excitement) decays.
    const player = makePlayer({ id: 'P1', x: 90, y: 580, width: 28, height: 40 });
    const state = makeState({ phase: 'playing', players: [player] });
    const sys = new ReactiveDecorationSystem(state, makeArena(), () => {});
    const i = inst({
      pos: { x: 100, y: 600 }, kind: 'test.bg',
      proximity: { radius: 60, mode: 'lean', magnitude: 10 },
    });
    sys.setInstances([i]);
    // Player inside radius — nearestDx tracks live position
    sys.cosmeticUpdate(1 / 30);
    expect(i.nearestDx).toBeDefined();
    const exitDir = i.nearestDx!;
    // Player walks far past on the OPPOSITE side (would flip nearestDx sign
    // if we still tracked, since 100 - 500 = -400 vs original ~+4)
    player.x = 500;
    sys.cosmeticUpdate(1 / 30);
    // nearestDx should be frozen at exit direction, not flipped to track far-away player
    expect(Math.sign(i.nearestDx!)).toBe(Math.sign(exitDir));
  });

  it('skips dead/respawning players when picking nearest', () => {
    const state = makeState({
      phase: 'playing',
      players: [
        makePlayer({ id: 'P1', x: 110, y: 580, width: 28, height: 40, state: 'splat' }),
        makePlayer({ id: 'P2', x: 500, y: 580, width: 28, height: 40, state: 'idle' }),
      ],
    });
    const sys = new ReactiveDecorationSystem(state, makeArena(), () => {});
    const i = inst({
      pos: { x: 100, y: 600 },
      kind: 'test.bg',
      proximity: { radius: 600, mode: 'flee', magnitude: 10 },
    });
    sys.setInstances([i]);
    sys.cosmeticUpdate(1 / 30);
    // P1 (splat) skipped, falls back to P2 (far) — dx is large negative
    expect(Math.abs(i.nearestDx!)).toBeGreaterThan(300);
  });

  it('applyStompImpulse sets shakeDecay only inside shakeRadius', () => {
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), makeArena(), () => {});
    const near = inst({ kind: 'test.bg', pos: { x: 100, y: 600 }, shakeRadius: 80 });
    const far = inst({ kind: 'test.bg', pos: { x: 500, y: 600 }, shakeRadius: 80 });
    sys.setInstances([near, far]);
    sys.applyStompImpulse(120, 600);
    expect(near.shakeDecay).toBe(1);
    expect(far.shakeDecay).toBe(0);
  });

  it('fires burst exactly once per stomp (rising edge)', () => {
    const emit = vi.fn();
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), makeArena(), emit);
    const i = inst({
      kind: 'test.bg', pos: { x: 100, y: 600 }, shakeRadius: 80,
      burst: { threshold: 0.95, particleKind: 'leaf', count: 5 },
    });
    sys.setInstances([i]);
    sys.applyStompImpulse(100, 600);
    sys.cosmeticUpdate(1 / 30); // decaying — no second fire
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('a second stomp during decay re-fires once the rising edge crosses again', () => {
    const emit = vi.fn();
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), makeArena(), emit);
    const i = inst({
      kind: 'test.bg', pos: { x: 100, y: 600 }, shakeRadius: 80,
      burst: { threshold: 0.95, particleKind: 'leaf', count: 5 },
    });
    sys.setInstances([i]);
    sys.applyStompImpulse(100, 600); // 1st burst
    // Decay below threshold
    for (let n = 0; n < 10; n++) sys.cosmeticUpdate(1 / 30);
    expect(i.shakeDecay).toBeLessThan(0.95);
    sys.applyStompImpulse(100, 600); // 2nd stomp — rising edge crosses again
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('resetBaseline invokes resetData for kinds that registered one', () => {
    _resetReactiveKindsForTest();
    const reset = vi.fn((d: unknown) => { (d as { phase: number }).phase = -1; });
    registerReactiveKind('test.stateful', {
      draw: () => {}, layer: 'prePlayer', resetData: reset,
    });
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), makeArena(), () => {});
    const i = inst({ kind: 'test.stateful', data: { phase: 5 } });
    sys.setInstances([i]);
    sys.resetBaseline();
    expect(reset).toHaveBeenCalledWith(i.data);
    expect((i.data as { phase: number }).phase).toBe(-1);
  });

  it('resetBaseline does not call resetData for kinds without inst.data', () => {
    _resetReactiveKindsForTest();
    const reset = vi.fn();
    registerReactiveKind('test.stateless', {
      draw: () => {}, layer: 'prePlayer', resetData: reset,
    });
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), makeArena(), () => {});
    sys.setInstances([inst({ kind: 'test.stateless' })]); // no data field
    sys.resetBaseline();
    expect(reset).not.toHaveBeenCalled();
  });

  it('resetBaseline zeros excitement, shakeDecay, and nearestDx without resetting windPhase', () => {
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), makeArena(), () => {});
    const i = inst({
      kind: 'test.bg', shakeRadius: 80,
      proximity: { radius: 60, mode: 'flee', magnitude: 10 },
    });
    i.excitement = 0.7;
    i.shakeDecay = 0.4;
    i.nearestDx = 12;
    sys.setInstances([i]);
    sys.fixedUpdate(1 / 60); // advance windPhase
    const phase = sys.getWindPhase();
    sys.resetBaseline();
    expect(i.excitement).toBe(0);
    expect(i.shakeDecay).toBe(0);
    expect(i.nearestDx).toBeUndefined();
    expect(sys.getWindPhase()).toBe(phase); // baseline reset preserves wind continuity
  });

  it('drops unknown kinds with a console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), makeArena(), () => {});
    sys.setInstances([
      inst({ kind: 'test.bg' }),
      inst({ kind: 'test.unregistered' }),
    ]);
    expect(sys.getInstancesForLayer('prePlayer')).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('test.unregistered'));
    warn.mockRestore();
  });

  it('cleanup empties all buckets and resets windPhase', () => {
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), makeArena(), () => {});
    sys.setInstances([inst({ kind: 'test.bg' }), inst({ kind: 'test.fg' })]);
    sys.fixedUpdate(1 / 60);
    sys.cleanup();
    expect(sys.getInstancesForLayer('prePlayer')).toHaveLength(0);
    expect(sys.getInstancesForLayer('postPlayer')).toHaveLength(0);
    expect(sys.getWindPhase()).toBe(0);
  });

  it('layer accessors return stable array references across calls (no per-frame alloc)', () => {
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), makeArena(), () => {});
    sys.setInstances([inst({ kind: 'test.bg' })]);
    const ref1 = sys.getInstancesForLayer('prePlayer');
    const ref2 = sys.getInstancesForLayer('prePlayer');
    expect(ref1).toBe(ref2);
  });

  it('exposes applyStompImpulse as a bindable callback', () => {
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), makeArena(), () => {});
    const cb: (x: number, y: number) => void = sys.applyStompImpulse.bind(sys);
    expect(typeof cb).toBe('function');
    cb(100, 600);
  });
});
