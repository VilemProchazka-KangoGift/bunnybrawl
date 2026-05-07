import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerReactiveKind, getReactiveKind, hasReactiveKind, _resetReactiveKindsForTest,
  updateExcitement, applyShakeImpulse, decayShake, shouldFireBurst, excitementBend, composeBend,
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
    registerReactiveKind('test.foo', { draw, layer: 'prePlayer' });
    expect(hasReactiveKind('test.foo')).toBe(true);
    const cfg = getReactiveKind('test.foo');
    expect(cfg?.draw).toBe(draw);
    expect(cfg?.layer).toBe('prePlayer');
    expect(cfg?.highFrequency).toBe(false); // default
  });

  it('overwrites on re-registration (test reload pattern)', () => {
    const a = () => {};
    const b = () => {};
    registerReactiveKind('test.foo', { draw: a, layer: 'prePlayer' });
    registerReactiveKind('test.foo', { draw: b, layer: 'postPlayer' });
    expect(getReactiveKind('test.foo')?.draw).toBe(b);
    expect(getReactiveKind('test.foo')?.layer).toBe('postPlayer');
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

  it('decays toward 0 when outside radius (slow settle, no snap-back)', () => {
    // Decay rate 0.4/s gives ~5.7s to reach 90% decay. After 1 second the
    // excitement should still be ~0.67 (most of the bend remains visible —
    // asymmetric ease, fast rise, very slow decay).
    const inst = makeInstance({ proximity: { radius: 50, mode: 'excite', magnitude: 1 }, excitement: 1 });
    for (let i = 0; i < 30; i++) updateExcitement(inst, 200, 1 / 30); // 1s
    expect(inst.excitement).toBeGreaterThan(0.6); // still mostly bent
    expect(inst.excitement).toBeLessThan(0.75);
    // Continue another ~7 seconds — now near zero.
    for (let i = 0; i < 7 * 30; i++) updateExcitement(inst, 200, 1 / 30);
    expect(inst.excitement).toBeLessThan(0.05);
  });

  it('rises faster than it decays (asymmetric — quick to react, slow to settle)', () => {
    // 0.5s ramp inside radius then 0.5s outside. Asymmetric rates (rise 2.4,
    // decay 0.9) mean we end up with more excitement than the simple linear
    // round-trip would suggest.
    const inst = makeInstance({ proximity: { radius: 50, mode: 'excite', magnitude: 1 } });
    for (let i = 0; i < 15; i++) updateExcitement(inst, 30, 1 / 30);
    const peak = inst.excitement;
    for (let i = 0; i < 15; i++) updateExcitement(inst, 200, 1 / 30);
    // After equal time outside, should still be > half of peak (slow decay).
    expect(inst.excitement).toBeGreaterThan(peak * 0.5);
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

  it('fires at exact threshold boundary (prev=threshold-ε, decay=threshold)', () => {
    const inst = makeInstance({ burst: { threshold: 0.95, particleKind: 'petal', count: 10 }, shakeDecay: 0.95 });
    expect(shouldFireBurst(inst, 0.949)).toBe(true);
  });

  it('does not fire when prev equals threshold exactly', () => {
    // prev < threshold uses strict less-than, so prev === threshold should not fire.
    const inst = makeInstance({ burst: { threshold: 0.95, particleKind: 'petal', count: 10 }, shakeDecay: 1 });
    expect(shouldFireBurst(inst, 0.95)).toBe(false);
  });
});

describe('reactiveDecorations — excitementBend', () => {
  it('returns 0 when excitement is at rest', () => {
    const inst = makeInstance({
      excitement: 0,
      proximity: { radius: 30, mode: 'flee', magnitude: 10 },
    });
    expect(excitementBend(inst)).toBe(0);
  });

  it('returns 0 when proximity is undefined', () => {
    const inst = makeInstance({ excitement: 0.5 });
    expect(excitementBend(inst)).toBe(0);
  });

  it('default leans WITH the player (signMul = -1)', () => {
    // Player to the LEFT of the decoration → nearestDx > 0 → bend negative
    // (decoration tip shifts left, in the same direction the player will
    // continue moving as they pass underneath/through).
    const inst = makeInstance({
      excitement: 1,
      proximity: { radius: 30, mode: 'lean', magnitude: 10 },
      nearestDx: 30,
    });
    expect(excitementBend(inst)).toBeCloseTo(-10, 5);
  });

  it('signMul = +1 produces flee behavior (away from player)', () => {
    const inst = makeInstance({
      excitement: 1,
      proximity: { radius: 30, mode: 'flee', magnitude: 10 },
      nearestDx: 30,
    });
    expect(excitementBend(inst, 1)).toBeCloseTo(10, 5);
  });

  it('clamps |nearestDx| > radius to ±1', () => {
    const inst = makeInstance({
      excitement: 1,
      proximity: { radius: 30, mode: 'lean', magnitude: 10 },
      nearestDx: 999, // way beyond radius — norm clamps to +1
    });
    expect(excitementBend(inst)).toBeCloseTo(-10, 5);
  });

  it('composeBend mutes wind sway by (1 - excitement) so decay does not cross neutral', () => {
    // Setup: wind blows decoration RIGHT (swayPhase = +5), player has pushed
    // it LEFT (excitement = 1, nearestDx > 0 → bend = -10 with default lean).
    const inst = makeInstance({
      excitement: 1,
      proximity: { radius: 30, mode: 'lean', magnitude: 10 },
      nearestDx: 30,
    });
    // At peak excitement: wind fully muted, only push direction.
    expect(composeBend(inst, 5)).toBeCloseTo(-10, 5);
    // At 0 excitement: wind fully present (no push contribution).
    inst.excitement = 0;
    expect(composeBend(inst, 5)).toBeCloseTo(5, 5);
    // Mid-decay: blend. excitement = 0.5 → wind contributes 2.5, push -5 → total -2.5
    inst.excitement = 0.5;
    expect(composeBend(inst, 5)).toBeCloseTo(-2.5, 5);
  });

  it('composeBend with opposite-direction wind never overshoots through zero abruptly', () => {
    // Worst case for snap-back: push opposite to wind. As excitement decays,
    // bend should smoothly transition from "pushed" toward "wind state" without
    // passing through zero earlier than late in the decay.
    const inst = makeInstance({
      excitement: 1,
      proximity: { radius: 30, mode: 'lean', magnitude: 18 },
      nearestDx: 30, // bend = -18 (left), wind = +5 (right)
    });
    const samples: number[] = [];
    for (const ex of [1.0, 0.8, 0.6, 0.4, 0.2, 0.05]) {
      inst.excitement = ex;
      samples.push(composeBend(inst, 5));
    }
    // Samples: -18, -15.4, -10.8, -4.2, +0.4, +4.65 — only crosses zero very
    // late (excitement ≈ 0.2, after most of the decay has happened). Without
    // muting, samples would be -13, -11.4, -7.8, -2.2, +1.4, +4.1 — crosses
    // earlier. The muting buys the user a longer stable "pushed" reading.
    expect(samples[0]).toBeLessThan(samples[1]); // monotonic toward wind dir
    expect(samples[3]).toBeLessThan(0); // still on push side at ex=0.4
  });

  it('seed-parity fallback uses full magnitude (norm = ±1), not 1/radius', () => {
    // When nearestDx is undefined (no live player), the fallback must produce
    // a visually meaningful bend, not ~0.5px. Default signMul=-1: even seed
    // → -magnitude, odd → +magnitude.
    const evenSeed = makeInstance({
      excitement: 1, seed: 4,
      proximity: { radius: 30, mode: 'lean', magnitude: 10 },
      // nearestDx intentionally undefined
    });
    const oddSeed = makeInstance({
      excitement: 1, seed: 5,
      proximity: { radius: 30, mode: 'lean', magnitude: 10 },
    });
    expect(excitementBend(evenSeed)).toBeCloseTo(-10, 5);
    expect(excitementBend(oddSeed)).toBeCloseTo(10, 5);
  });
});
