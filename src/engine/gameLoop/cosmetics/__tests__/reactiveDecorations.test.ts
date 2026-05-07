import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerReactiveKind, getReactiveKind, hasReactiveKind, _resetReactiveKindsForTest,
  updateExcitement, applyShakeImpulse, decayShake, shouldFireBurst,
  type ReactiveInstance, type ReactiveKindConfig,
} from '../reactiveDecorations';

function makeInstance(overrides: Partial<ReactiveInstance> = {}): ReactiveInstance {
  return {
    pos: { x: 100, y: 600 },
    kind: 'test.x',
    seed: 1,
    excitement: 0,
    shakeDecay: 0,
    ...overrides,
  };
}

describe('reactiveDecorations — kind registry', () => {
  beforeEach(() => { _resetReactiveKindsForTest(); });

  it('registers and retrieves a kind', () => {
    const draw = () => {};
    registerReactiveKind('test.foo', { draw, layer: 'background' });
    expect(hasReactiveKind('test.foo')).toBe(true);
    const cfg = getReactiveKind('test.foo');
    expect(cfg?.draw).toBe(draw);
    expect(cfg?.layer).toBe('background');
    expect(cfg?.highFrequency).toBe(false); // default
  });

  it('overwrites on re-registration (test reload pattern)', () => {
    const a = () => {};
    const b = () => {};
    registerReactiveKind('test.foo', { draw: a, layer: 'background' });
    registerReactiveKind('test.foo', { draw: b, layer: 'foreground' });
    expect(getReactiveKind('test.foo')?.draw).toBe(b);
    expect(getReactiveKind('test.foo')?.layer).toBe('foreground');
  });

  it('returns undefined for unknown kind', () => {
    expect(getReactiveKind('test.missing')).toBeUndefined();
    expect(hasReactiveKind('test.missing')).toBe(false);
  });
});

describe('reactiveDecorations — excitement primitive', () => {
  it('rises toward 1 when within radius', () => {
    const inst = makeInstance({ proximity: { radius: 50, mode: 'excite', magnitude: 1 } });
    // Simulate 10 ticks of player at distance 30 (within radius 50)
    for (let i = 0; i < 10; i++) updateExcitement(inst, 30, 1 / 30);
    expect(inst.excitement).toBeGreaterThan(0.5);
    expect(inst.excitement).toBeLessThanOrEqual(1);
  });

  it('decays toward 0 when outside radius', () => {
    const inst = makeInstance({ proximity: { radius: 50, mode: 'excite', magnitude: 1 }, excitement: 1 });
    for (let i = 0; i < 30; i++) updateExcitement(inst, 200, 1 / 30);
    expect(inst.excitement).toBeLessThan(0.1);
  });

  it('is a no-op when proximity is undefined', () => {
    const inst = makeInstance();
    inst.excitement = 0.5;
    updateExcitement(inst, 10, 1 / 30);
    expect(inst.excitement).toBe(0.5);
  });
});

describe('reactiveDecorations — shake primitive', () => {
  it('sets shakeDecay to 1 when stomp is within shakeRadius', () => {
    const inst = makeInstance({ pos: { x: 100, y: 600 }, shakeRadius: 80 });
    applyShakeImpulse(inst, 120, 600); // distance 20 — within
    expect(inst.shakeDecay).toBe(1);
  });

  it('does not set shakeDecay when stomp is outside shakeRadius', () => {
    const inst = makeInstance({ pos: { x: 100, y: 600 }, shakeRadius: 80 });
    applyShakeImpulse(inst, 500, 600); // distance 400 — outside
    expect(inst.shakeDecay).toBe(0);
  });

  it('does not set shakeDecay when shakeRadius is undefined', () => {
    const inst = makeInstance({ pos: { x: 100, y: 600 } });
    applyShakeImpulse(inst, 100, 600);
    expect(inst.shakeDecay).toBe(0);
  });

  it('decays shakeDecay at rate 7/sec', () => {
    const inst = makeInstance({ shakeDecay: 1 });
    decayShake(inst, 1 / 30); // ~0.233 of decay
    expect(inst.shakeDecay).toBeGreaterThan(0.7);
    expect(inst.shakeDecay).toBeLessThan(0.8);
  });
});

describe('reactiveDecorations — burst trigger', () => {
  it('fires when shakeDecay rises above threshold (rising edge from 0)', () => {
    const inst = makeInstance({ burst: { threshold: 0.95, particleKind: 'petal', count: 10 }, shakeDecay: 0.95 });
    expect(shouldFireBurst(inst, 0)).toBe(true);
  });

  it('does not fire when shakeDecay was already above threshold', () => {
    const inst = makeInstance({ burst: { threshold: 0.95, particleKind: 'petal', count: 10 }, shakeDecay: 0.96 });
    expect(shouldFireBurst(inst, 0.95)).toBe(false);
  });

  it('does not fire when shakeDecay never crosses threshold', () => {
    const inst = makeInstance({ burst: { threshold: 0.95, particleKind: 'petal', count: 10 }, shakeDecay: 0.5 });
    expect(shouldFireBurst(inst, 0.4)).toBe(false);
  });

  it('does not fire when burst is undefined', () => {
    const inst = makeInstance({ shakeDecay: 1 });
    expect(shouldFireBurst(inst, 0)).toBe(false);
  });
});
