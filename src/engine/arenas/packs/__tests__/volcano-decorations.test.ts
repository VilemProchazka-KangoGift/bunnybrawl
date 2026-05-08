import { describe, it, expect, beforeAll, vi } from 'vitest';
import { registerBuiltinArenas } from '../../builtin';
import { getArenaPack } from '../../registry';
import { getArena } from '../../operations';
import { hasReactiveKind, getReactiveKind } from '../../../gameLoop/cosmetics';

vi.mock('../../../perfFlags', () => ({ getSlowDevice: () => false }));

beforeAll(() => {
  registerBuiltinArenas();
});

describe('volcano — buildReactiveDecorations', () => {
  it('builds the expected number of instances', () => {
    const pack = getArenaPack('volcano');
    expect(pack).toBeDefined();
    const arena = getArena('volcano');
    const list = pack!.buildReactiveDecorations!(arena);
    // 5 dead trees
    expect(list.length).toBe(5);
  });

  it('every instance has a registered kind', () => {
    const pack = getArenaPack('volcano');
    const arena = getArena('volcano');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(hasReactiveKind(inst.kind)).toBe(true);
    }
  });

  it('every instance position is within sane bounds', () => {
    const pack = getArenaPack('volcano');
    const arena = getArena('volcano');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(inst.pos.x).toBeGreaterThanOrEqual(-50);
      expect(inst.pos.x).toBeLessThanOrEqual(arena.width + 50);
      expect(inst.pos.y).toBeGreaterThanOrEqual(0);
      expect(inst.pos.y).toBeLessThanOrEqual(arena.height + 100);
    }
  });

  it('expected kinds are present', () => {
    const expected = ['volcano.deadTree'];
    for (const k of expected) {
      expect(hasReactiveKind(k)).toBe(true);
    }
  });

  it('dead trees are prePlayer + low frequency (default)', () => {
    const dt = getReactiveKind('volcano.deadTree');
    expect(dt?.layer).toBe('prePlayer');
    expect(dt?.highFrequency).toBeFalsy();
  });

  it('renders without errors at multiple windPhase slices', () => {
    const pack = getArenaPack('volcano');
    const arena = getArena('volcano');
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
