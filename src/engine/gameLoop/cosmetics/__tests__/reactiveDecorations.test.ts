import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerReactiveKind, getReactiveKind, hasReactiveKind, _resetReactiveKindsForTest,
  updateExcitement, applyShakeImpulse, decayShake, shouldFireBurst, composeBend,
  tickBendDynamics, bendCoeffForProximity, createReactiveInstance,
  type ReactiveInstance, type ReactiveKindConfig,
} from '../reactiveDecorations';

function makeInstance(overrides: Partial<ReactiveInstance> = {}): ReactiveInstance {
  return {
    pos: { x: 100, y: 600 },
    kind: 'test.x',
    seed: 1,
    excitement: 0,
    shakeDecay: 0,
    bendValue: 0,
    bendVelocity: 0,
    bendCoeff: 0,
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
    expect(cfg?.highFrequency).toBe(false);
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
    for (let i = 0; i < 10; i++) updateExcitement(inst, 30, 1 / 30);
    expect(inst.excitement).toBeGreaterThan(0.5);
    expect(inst.excitement).toBeLessThanOrEqual(1);
  });

  it('decays toward 0 when outside radius (slow settle, no snap-back)', () => {
    const inst = makeInstance({ proximity: { radius: 50, mode: 'excite', magnitude: 1 }, excitement: 1 });
    for (let i = 0; i < 30; i++) updateExcitement(inst, 200, 1 / 30); // 1s
    expect(inst.excitement).toBeGreaterThan(0.6); // still mostly bent
    expect(inst.excitement).toBeLessThan(0.75);
    for (let i = 0; i < 7 * 30; i++) updateExcitement(inst, 200, 1 / 30);
    expect(inst.excitement).toBeLessThan(0.05);
  });

  it('rises faster than it decays (asymmetric — quick to react, slow to settle)', () => {
    const inst = makeInstance({ proximity: { radius: 50, mode: 'excite', magnitude: 1 } });
    for (let i = 0; i < 15; i++) updateExcitement(inst, 30, 1 / 30);
    const peak = inst.excitement;
    for (let i = 0; i < 15; i++) updateExcitement(inst, 200, 1 / 30);
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
    applyShakeImpulse(inst, 120, 600);
    expect(inst.shakeDecay).toBe(1);
  });

  it('does not set shakeDecay when stomp is outside shakeRadius', () => {
    const inst = makeInstance({ pos: { x: 100, y: 600 }, shakeRadius: 80 });
    applyShakeImpulse(inst, 500, 600);
    expect(inst.shakeDecay).toBe(0);
  });

  it('does not set shakeDecay when shakeRadius is undefined', () => {
    const inst = makeInstance({ pos: { x: 100, y: 600 } });
    applyShakeImpulse(inst, 100, 600);
    expect(inst.shakeDecay).toBe(0);
  });

  it('decays shakeDecay at rate 7/sec', () => {
    const inst = makeInstance({ shakeDecay: 1 });
    decayShake(inst, 1 / 30);
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
    const inst = makeInstance({ burst: { threshold: 0.95, particleKind: 'petal', count: 10 }, shakeDecay: 1 });
    expect(shouldFireBurst(inst, 0.95)).toBe(false);
  });
});

describe('reactiveDecorations — bend dynamics (spring-damper)', () => {
  it('bendCoeffForProximity scales linearly with magnitude', () => {
    expect(bendCoeffForProximity(36, 'lean') / bendCoeffForProximity(18, 'lean')).toBeCloseTo(2, 5);
  });

  it('bendCoeffForProximity flips sign for mode=flee', () => {
    expect(bendCoeffForProximity(18, 'lean')).toBeGreaterThan(0);
    expect(bendCoeffForProximity(18, 'flee')).toBeLessThan(0);
  });

  it('bendCoeffForProximity returns 0 for mode=excite (pure excitement scalar — no bend coupling)', () => {
    expect(bendCoeffForProximity(18, 'excite')).toBe(0);
  });

  it('tickBendDynamics with constant force converges to equilibrium = magnitude at vx=200', () => {
    // The system is tuned so a player at WALKING_SPEED_REF (200 px/s) with
    // proximityFactor=1 produces a steady-state bend equal to magnitude.
    // Force = vx × prox × bendCoeff, so we reproduce the system's inner-loop math here.
    const inst = makeInstance();
    const force = 200 * 1 * bendCoeffForProximity(18, 'lean');
    for (let i = 0; i < 200; i++) tickBendDynamics(inst, force, 1 / 60);
    expect(inst.bendValue).toBeCloseTo(18, 0);
  });

  it('tickBendDynamics with no force decays toward zero', () => {
    const inst = makeInstance({ bendValue: 20, bendVelocity: 0 });
    for (let i = 0; i < 200; i++) tickBendDynamics(inst, 0, 1 / 60);
    expect(Math.abs(inst.bendValue)).toBeLessThan(0.5);
    expect(Math.abs(inst.bendVelocity)).toBeLessThan(0.5);
  });

  it('tickBendDynamics is stable at the cosmetic-tick rate (dt up to 67ms)', () => {
    const inst = makeInstance();
    const force = 400 * 1 * bendCoeffForProximity(30, 'lean');
    for (let i = 0; i < 60; i++) tickBendDynamics(inst, force, 1 / 15);
    expect(Math.abs(inst.bendValue)).toBeLessThan(200);
    expect(Number.isFinite(inst.bendValue)).toBe(true);
    expect(Number.isFinite(inst.bendVelocity)).toBe(true);
  });

  it('fast-pass impulse produces a peak that arrives AFTER the player exits', () => {
    const inst = makeInstance();
    const force = 400 * 1 * bendCoeffForProximity(18, 'lean');
    for (let i = 0; i < 5; i++) tickBendDynamics(inst, force, 1 / 60);
    const bendAtExit = inst.bendValue;
    const velAtExit = inst.bendVelocity;
    for (let i = 0; i < 5; i++) tickBendDynamics(inst, 0, 1 / 60);
    expect(Math.abs(inst.bendValue)).toBeGreaterThan(Math.abs(bendAtExit));
    expect(Math.abs(velAtExit)).toBeGreaterThan(0);
  });
});

describe('reactiveDecorations — createReactiveInstance', () => {
  it('fills runtime-state defaults (excitement, shakeDecay, bendValue, bendVelocity, bendCoeff = 0)', () => {
    const inst = createReactiveInstance({
      pos: { x: 1, y: 2 },
      kind: 'test.x',
      seed: 7,
      windAmp: 5,
      proximity: { radius: 30, mode: 'lean', magnitude: 18 },
    });
    expect(inst.excitement).toBe(0);
    expect(inst.shakeDecay).toBe(0);
    expect(inst.bendValue).toBe(0);
    expect(inst.bendVelocity).toBe(0);
    expect(inst.bendCoeff).toBe(0);
    expect(inst.pos).toEqual({ x: 1, y: 2 });
    expect(inst.proximity?.magnitude).toBe(18);
  });

  it('preserves optional config fields when omitted', () => {
    const inst = createReactiveInstance({
      pos: { x: 0, y: 0 }, kind: 'test.x', seed: 0,
    });
    expect(inst.proximity).toBeUndefined();
    expect(inst.shakeRadius).toBeUndefined();
    expect(inst.burst).toBeUndefined();
    expect(inst.windAmp).toBeUndefined();
    expect(inst.data).toBeUndefined();
  });
});

describe('reactiveDecorations — composeBend', () => {
  it('mutes wind by (1 - excitement) and adds bendValue', () => {
    const inst = makeInstance({ excitement: 1, bendValue: -10 });
    // At peak excitement: wind fully muted, only bendValue reads.
    expect(composeBend(inst, 5)).toBeCloseTo(-10, 5);
    // At 0 excitement: wind fully present (bendValue=0 if at rest, but here we set it to 0 explicitly).
    inst.excitement = 0;
    inst.bendValue = 0;
    expect(composeBend(inst, 5)).toBeCloseTo(5, 5);
    // Mid-decay: blend.
    inst.excitement = 0.5;
    inst.bendValue = -5;
    expect(composeBend(inst, 5)).toBeCloseTo(-2.5, 5); // 5*0.5 + -5 = -2.5
  });

  it('opposite-wind push doesn\'t snap through neutral on relaxation', () => {
    // Wind blows right (+5), player pushed bend left (bendValue=-15, excitement=1).
    // As excitement decays AND bend springs back, the wind muting prevents
    // a sudden flip through zero to the wind direction.
    const inst = makeInstance({ excitement: 1, bendValue: -15 });
    expect(composeBend(inst, 5)).toBeCloseTo(-15, 5);
    // Mid-decay (excitement 0.5, bendValue 0.5*-15 ≈ -7.5 in real spring-damper):
    // Approximate by setting both manually — composeBend doesn't simulate, just composes.
    inst.excitement = 0.5;
    inst.bendValue = -7.5;
    expect(composeBend(inst, 5)).toBeCloseTo(-5, 5); // still on push side
    // Late decay (excitement near 0, bend near 0):
    inst.excitement = 0.05;
    inst.bendValue = -0.5;
    expect(composeBend(inst, 5)).toBeCloseTo(4.25, 5); // wind takes over only when both have nearly settled
  });
});
