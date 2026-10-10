import { describe, it, expect, beforeAll, vi } from 'vitest';
import { registerBuiltinArenas } from '../../builtin';
import { getArenaPack } from '../../registry';
import { getArena } from '../../operations';
import { hasReactiveKind, getReactiveKind } from '../../../gameLoop/cosmetics';

vi.mock('../../../perfFlags', () => ({ getSlowDevice: () => false }));

beforeAll(() => {
  registerBuiltinArenas();
});

describe('castle — buildReactiveDecorations', () => {
  it('builds a non-empty instance list', () => {
    const pack = getArenaPack('castle');
    expect(pack).toBeDefined();
    const arena = getArena('castle');
    const list = pack!.buildReactiveDecorations!(arena);
    // Sparse Moonlit banners and the existing cobwebs fill the scene.
    expect(list.length).toBeGreaterThan(10);
  });

  it('every instance has a registered kind', () => {
    const pack = getArenaPack('castle');
    const arena = getArena('castle');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(hasReactiveKind(inst.kind)).toBe(true);
    }
  });

  it('every instance position is within sane bounds', () => {
    const pack = getArenaPack('castle');
    const arena = getArena('castle');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(inst.pos.x).toBeGreaterThanOrEqual(-50);
      expect(inst.pos.x).toBeLessThanOrEqual(arena.width + 50);
      expect(inst.pos.y).toBeGreaterThanOrEqual(0);
      expect(inst.pos.y).toBeLessThanOrEqual(arena.height + 50);
    }
  });

  it('expected kinds are present', () => {
    const expected = ['castle.cobweb', 'castle.banner'];
    for (const k of expected) {
      expect(hasReactiveKind(k)).toBe(true);
    }
  });

  it('cobwebs + banners register as postPlayer', () => {
    const cobweb = getReactiveKind('castle.cobweb');
    expect(cobweb?.layer).toBe('postPlayer');
    const banner = getReactiveKind('castle.banner');
    expect(banner?.layer).toBe('postPlayer');
  });

  it('keeps the approved Moonlit banner placement sparse', () => {
    const pack = getArenaPack('castle');
    const arena = getArena('castle');
    const list = pack!.buildReactiveDecorations!(arena);
    const banners = list.filter((i) => i.kind === 'castle.banner');
    expect(banners.length).toBeGreaterThanOrEqual(4);
    expect(banners.length).toBeLessThanOrEqual(5);
    expect(banners.every(b => b.pos.y < 430)).toBe(true);
  });

  it('renders without errors at multiple windPhase slices', () => {
    const pack = getArenaPack('castle');
    const arena = getArena('castle');
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
