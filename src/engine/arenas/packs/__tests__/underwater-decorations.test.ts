import { describe, it, expect, beforeAll, vi } from 'vitest';
import { registerBuiltinArenas } from '../../builtin';
import { getArenaPack } from '../../registry';
import { getArena } from '../../operations';
import { hasReactiveKind, getReactiveKind } from '../../../gameLoop/cosmetics';
import { makeState, makePlayer } from '../../../__tests__/testHelpers';

vi.mock('../../../perfFlags', () => ({ getSlowDevice: () => false }));

beforeAll(() => {
  registerBuiltinArenas();
});

describe('underwater — buildReactiveDecorations', () => {
  it('builds a non-empty instance list', () => {
    const pack = getArenaPack('underwater');
    expect(pack).toBeDefined();
    const arena = getArena('underwater');
    const list = pack!.buildReactiveDecorations!(arena);
    // 6 ground seaweed + 4 fg (kelp+seaweed) + N platform-kelp + 18 fish + per-platform seaweed
    expect(list.length).toBeGreaterThan(30);
  });

  it('every instance has a registered kind', () => {
    const pack = getArenaPack('underwater');
    const arena = getArena('underwater');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(hasReactiveKind(inst.kind)).toBe(true);
    }
  });

  it('every instance position is within sane bounds', () => {
    const pack = getArenaPack('underwater');
    const arena = getArena('underwater');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(inst.pos.x).toBeGreaterThanOrEqual(-50);
      expect(inst.pos.x).toBeLessThanOrEqual(arena.width + 50);
      expect(inst.pos.y).toBeGreaterThanOrEqual(0);
      // platform-kelp strands hang ~30px below platform bottom
      expect(inst.pos.y).toBeLessThanOrEqual(arena.height + 100);
    }
  });

  it('expected kinds are present', () => {
    const expected = [
      'underwater.seaweed',
      'underwater.fgKelp',
      'underwater.fgSeaweed',
      'underwater.platformKelp',
      'underwater.fishSchool',
    ];
    for (const k of expected) {
      expect(hasReactiveKind(k)).toBe(true);
    }
  });

  it('fishSchool registers as postPlayer + highFrequency', () => {
    const fish = getReactiveKind('underwater.fishSchool');
    expect(fish?.layer).toBe('postPlayer');
    expect(fish?.highFrequency).toBe(true);
  });

  it('seaweed/kelp kinds register as prePlayer', () => {
    for (const k of ['underwater.seaweed', 'underwater.fgKelp', 'underwater.fgSeaweed', 'underwater.platformKelp']) {
      const cfg = getReactiveKind(k);
      expect(cfg?.layer).toBe('prePlayer');
      // Plant kinds should not be highFrequency.
      expect(cfg?.highFrequency).toBe(false);
    }
  });

  it('emits at least one platformKelp instance', () => {
    const pack = getArenaPack('underwater');
    const arena = getArena('underwater');
    const list = pack!.buildReactiveDecorations!(arena);
    const platformKelp = list.filter((i) => i.kind === 'underwater.platformKelp');
    expect(platformKelp.length).toBeGreaterThan(0);
  });

  it('emits exactly FISH_COUNT (18) fishSchool instances', () => {
    const pack = getArenaPack('underwater');
    const arena = getArena('underwater');
    const list = pack!.buildReactiveDecorations!(arena);
    const fish = list.filter((i) => i.kind === 'underwater.fishSchool');
    expect(fish.length).toBe(18);
  });

  it('renders without errors at multiple windPhase slices', () => {
    const pack = getArenaPack('underwater');
    const arena = getArena('underwater');
    const list = pack!.buildReactiveDecorations!(arena);
    const ctx = {
      save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
      scale: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
      arc: () => {}, ellipse: () => {}, fill: () => {}, stroke: () => {},
      fillRect: () => {}, quadraticCurveTo: () => {}, bezierCurveTo: () => {},
      closePath: () => {},
      fillStyle: '', strokeStyle: '',
      lineWidth: 0, globalAlpha: 1, lineCap: '',
      createLinearGradient: () => ({ addColorStop: () => {} }),
      clip: () => {},
    } as unknown as CanvasRenderingContext2D;
    const fakeState = { players: [], timeElapsed: 0, dayPhase: 0 } as never;
    for (const slice of [0, 0.5, 1.0, 5.0]) {
      for (const inst of list) {
        const cfg = getReactiveKind(inst.kind)!;
        const sway = Math.sin(slice + inst.seed * 0.7) * (inst.windAmp ?? 0);
        expect(() => cfg.draw(ctx, inst, sway, slice, 0, fakeState)).not.toThrow();
      }
    }
  });
});

// Regression guard: cosmeticTick (player bubble trails) must keep working
// alongside buildReactiveDecorations. Mirrors underwater-bubbles.test.ts.
describe('underwater — cosmeticTick (bubble trails) regression', () => {
  it('cosmeticTick still defined after reactive migration', () => {
    const pack = getArenaPack('underwater');
    expect(pack!.cosmeticTick).toBeDefined();
  });

  it('emits bubbles when player moves with vx > 50', () => {
    const pack = getArenaPack('underwater');
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
});
