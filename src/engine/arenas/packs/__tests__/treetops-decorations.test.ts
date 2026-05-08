import { describe, it, expect, beforeAll, vi } from 'vitest';
import { registerBuiltinArenas } from '../../builtin';
import { getArenaPack } from '../../registry';
import { getArena } from '../../operations';
import { hasReactiveKind, getReactiveKind } from '../../../gameLoop/cosmetics';

vi.mock('../../../perfFlags', () => ({ getSlowDevice: () => false }));

beforeAll(() => {
  registerBuiltinArenas();
});

describe('treetops — buildReactiveDecorations', () => {
  it('builds a non-empty instance list', () => {
    const pack = getArenaPack('treetops');
    expect(pack).toBeDefined();
    const arena = getArena('treetops');
    const list = pack!.buildReactiveDecorations!(arena);
    expect(list.length).toBeGreaterThan(15); // 3 trees + N vines + N ferns + 6 butterflies + 2 bees
  });

  it('every instance has a registered kind', () => {
    const pack = getArenaPack('treetops');
    const arena = getArena('treetops');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(hasReactiveKind(inst.kind)).toBe(true);
    }
  });

  it('every instance position is within sane bounds', () => {
    const pack = getArenaPack('treetops');
    const arena = getArena('treetops');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(inst.pos.x).toBeGreaterThanOrEqual(-50);
      expect(inst.pos.x).toBeLessThanOrEqual(arena.width + 50);
      expect(inst.pos.y).toBeGreaterThanOrEqual(0);
      // trees rooted at y=750, below visible canvas
      expect(inst.pos.y).toBeLessThanOrEqual(arena.height + 100);
    }
  });

  it('expected kinds are present', () => {
    const expected = [
      'treetops.tree', 'decoration.hangingVine', 'decoration.fern',
      'treetops.butterfly', 'treetops.bee',
    ];
    for (const k of expected) {
      expect(hasReactiveKind(k)).toBe(true);
    }
  });

  it('butterflies + bees register as postPlayer + highFrequency', () => {
    const butterfly = getReactiveKind('treetops.butterfly');
    expect(butterfly?.layer).toBe('postPlayer');
    expect(butterfly?.highFrequency).toBe(true);
    const bee = getReactiveKind('treetops.bee');
    expect(bee?.layer).toBe('postPlayer');
    expect(bee?.highFrequency).toBe(true);
  });

  it('renders without errors at multiple windPhase slices', () => {
    const pack = getArenaPack('treetops');
    const arena = getArena('treetops');
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
        expect(() => cfg.draw(ctx, inst, sway, 0, 0, fakeState)).not.toThrow();
      }
    }
  });
});
