import { describe, it, expect, beforeAll, vi } from 'vitest';
import { registerBuiltinArenas } from '../../builtin';
import { getArenaPack } from '../../registry';
import { getArena } from '../../operations';
import { hasReactiveKind, getReactiveKind } from '../../../gameLoop/cosmetics';
import { ReactiveDecorationSystem } from '../../../gameLoop/cosmetics/ReactiveDecorationSystem';
import { makeState } from '../../../__tests__/testHelpers';

vi.mock('../../../perfFlags', () => ({ getSlowDevice: () => false }));

beforeAll(() => {
  registerBuiltinArenas();
});

describe('meadow — buildReactiveDecorations', () => {
  it('builds a non-empty instance list', () => {
    const pack = getArenaPack('meadow');
    expect(pack).toBeDefined();
    const arena = getArena('meadow');
    const list = pack!.buildReactiveDecorations!(arena);
    expect(list.length).toBeGreaterThan(40); // 3 trees + 5 bushes + 10 flowers + 9 dandelions + 8 butterflies + ...
  });

  it('every instance has a registered kind', () => {
    const pack = getArenaPack('meadow');
    const arena = getArena('meadow');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(hasReactiveKind(inst.kind)).toBe(true);
    }
  });

  it('every instance position is within arena bounds', () => {
    const pack = getArenaPack('meadow');
    const arena = getArena('meadow');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(inst.pos.x).toBeGreaterThanOrEqual(-50); // some hang off-edge slightly
      expect(inst.pos.x).toBeLessThanOrEqual(arena.width + 50);
      expect(inst.pos.y).toBeGreaterThanOrEqual(0);
      expect(inst.pos.y).toBeLessThanOrEqual(arena.height + 50);
    }
  });

  it('expected kinds are present', () => {
    const expected = [
      'meadow.tree', 'decoration.tallGrass', 'decoration.fern', 'decoration.hangingVine',
      'meadow.dandelion', 'meadow.butterfly', 'meadow.bee',
    ];
    for (const k of expected) {
      expect(hasReactiveKind(k)).toBe(true);
    }
  });

  it('butterflies + bees register as foreground + highFrequency', () => {
    const butterfly = getReactiveKind('meadow.butterfly');
    expect(butterfly?.layer).toBe('postPlayer');
    expect(butterfly?.highFrequency).toBe(true);
    const bee = getReactiveKind('meadow.bee');
    expect(bee?.layer).toBe('postPlayer');
    expect(bee?.highFrequency).toBe(true);
  });

  it('system.resetBaseline() rewinds dandelion bursts to idle', () => {
    // Pins the round-3 fix: on guest reconnect / loading→playing edge, in-
    // flight dandelion seed-bursts must reset so reconnects don't show partial
    // puffs. A future refactor that drops the resetData wiring (in
    // GameLoop.resetCosmeticBaselines or in the meadow.dandelion registration)
    // would silently regress without this test.
    const pack = getArenaPack('meadow');
    const arena = getArena('meadow');
    const list = pack!.buildReactiveDecorations!(arena);
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), arena, () => {});
    sys.setInstances(list);
    const dandelion = list.find((i) => i.kind === 'meadow.dandelion');
    expect(dandelion).toBeDefined();
    (dandelion!.data as { phase: number }).phase = 3.5; // mid-burst
    sys.resetBaseline();
    expect((dandelion!.data as { phase: number }).phase).toBe(-1);
  });

  it('renders without errors at multiple windPhase slices', () => {
    const pack = getArenaPack('meadow');
    const arena = getArena('meadow');
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
        // sway phase = sin(slice + seed * 0.7) * (windAmp ?? 0)
        const sway = Math.sin(slice + inst.seed * 0.7) * (inst.windAmp ?? 0);
        expect(() => cfg.draw(ctx, inst, sway, 0, 0, fakeState)).not.toThrow();
      }
    }
  });
});
