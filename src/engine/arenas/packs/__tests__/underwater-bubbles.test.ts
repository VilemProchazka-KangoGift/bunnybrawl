import { describe, it, expect, beforeAll, vi } from 'vitest';
import { registerBuiltinArenas } from '../../builtin';
import { getArenaPack } from '../../registry';
import { makeArena, makeState, makePlayer } from '../../../__tests__/testHelpers';

vi.mock('../../../perfFlags', () => ({ getSlowDevice: () => false }));

beforeAll(() => {
  registerBuiltinArenas();
});

describe('underwater — cosmeticTick (bubble trails)', () => {
  it('emits bubbles when player moves with vx > 50', () => {
    const pack = getArenaPack('underwater');
    expect(pack).toBeDefined();
    expect(pack!.cosmeticTick).toBeDefined();

    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 100, y: 400, vx: 80, vy: 0 })],
    });
    const emitParticle = vi.fn();
    let emitted = 0;
    for (let i = 0; i < 50; i++) {
      pack!.cosmeticTick!(state, 1 / 30, { emitParticle });
      emitted = emitParticle.mock.calls.length;
      if (emitted > 0) break;
    }
    expect(emitted).toBeGreaterThan(0);
  });

  it('does not emit when player vx is below threshold', () => {
    const pack = getArenaPack('underwater');
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 100, y: 400, vx: 30, vy: 0 })],
    });
    const emitParticle = vi.fn();
    for (let i = 0; i < 50; i++) {
      pack!.cosmeticTick!(state, 1 / 30, { emitParticle });
    }
    expect(emitParticle).not.toHaveBeenCalled();
  });

  it('does not emit for inactive or splat players', () => {
    const pack = getArenaPack('underwater');
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400, vx: 200, vy: 0, active: false }),
        makePlayer({ id: 'P2', x: 200, y: 400, vx: 200, vy: 0, state: 'splat' }),
      ],
    });
    const emitParticle = vi.fn();
    for (let i = 0; i < 50; i++) {
      pack!.cosmeticTick!(state, 1 / 30, { emitParticle });
    }
    expect(emitParticle).not.toHaveBeenCalled();
  });

  it('throttles bubble emission per player', () => {
    const pack = getArenaPack('underwater');
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 100, y: 400, vx: 200, vy: 0 })],
    });
    const emitParticle = vi.fn();
    // 30 ticks at dt=1/30 = 1 second. Throttle 0.08s/emit → at most ~13 emits.
    for (let i = 0; i < 30; i++) {
      pack!.cosmeticTick!(state, 1 / 30, { emitParticle });
    }
    expect(emitParticle.mock.calls.length).toBeLessThan(20);
  });
});
