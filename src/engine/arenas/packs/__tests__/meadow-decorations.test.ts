import { describe, it, expect, beforeAll } from 'vitest';
import { registerBuiltinArenas } from '../../builtin';
import { getArenaPack } from '../../registry';
import { getArena } from '../../operations';
import { hasReactiveKind, getReactiveKind } from '../../../gameLoop/cosmetics';

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
      'meadow.tree', 'meadow.tallGrass', 'meadow.fern', 'meadow.hangingVine',
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
