import { describe, it, expect, beforeAll, vi } from 'vitest';
import { registerBuiltinArenas } from '../../builtin';
import { getArenaPack } from '../../registry';
import { getArena } from '../../operations';
import { hasReactiveKind, getReactiveKind } from '../../../gameLoop/cosmetics';

vi.mock('../../../perfFlags', () => ({ getSlowDevice: () => false }));

beforeAll(() => {
  registerBuiltinArenas();
});

describe('rooftops — buildReactiveDecorations', () => {
  it('builds a non-empty instance list', () => {
    const pack = getArenaPack('rooftops');
    expect(pack).toBeDefined();
    const arena = getArena('rooftops');
    const list = pack!.buildReactiveDecorations!(arena);
    expect(list.length).toBeGreaterThanOrEqual(4); // 2 clotheslines + 2 antennas
  });

  it('every instance has a registered kind', () => {
    const pack = getArenaPack('rooftops');
    const arena = getArena('rooftops');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(hasReactiveKind(inst.kind)).toBe(true);
    }
  });

  it('every instance position is within sane bounds', () => {
    const pack = getArenaPack('rooftops');
    const arena = getArena('rooftops');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(inst.pos.x).toBeGreaterThanOrEqual(-50);
      expect(inst.pos.x).toBeLessThanOrEqual(arena.width + 50);
      expect(inst.pos.y).toBeGreaterThanOrEqual(0);
      expect(inst.pos.y).toBeLessThanOrEqual(arena.height + 100);
    }
  });

  it('expected kinds are present', () => {
    const expected = ['rooftops.clothesline', 'rooftops.antenna'];
    for (const k of expected) {
      expect(hasReactiveKind(k)).toBe(true);
    }
  });

  it('clothesline registers as prePlayer with proximity lean reactivity', () => {
    const pack = getArenaPack('rooftops');
    const arena = getArena('rooftops');
    const list = pack!.buildReactiveDecorations!(arena);
    const cfg = getReactiveKind('rooftops.clothesline');
    expect(cfg?.layer).toBe('prePlayer');
    const clothesline = list.find(i => i.kind === 'rooftops.clothesline');
    expect(clothesline).toBeDefined();
    expect(clothesline!.proximity?.mode).toBe('lean');
    expect(clothesline!.proximity?.radius).toBe(40);
    expect(clothesline!.proximity?.magnitude).toBe(22);
    expect(clothesline!.windAmp).toBe(8);
  });

  it('antenna registers as prePlayer with stomp shake (no proximity, no burst)', () => {
    const pack = getArenaPack('rooftops');
    const arena = getArena('rooftops');
    const list = pack!.buildReactiveDecorations!(arena);
    const cfg = getReactiveKind('rooftops.antenna');
    expect(cfg?.layer).toBe('prePlayer');
    const antenna = list.find(i => i.kind === 'rooftops.antenna');
    expect(antenna).toBeDefined();
    expect(antenna!.shakeRadius).toBe(60);
    expect(antenna!.proximity).toBeUndefined();
    expect(antenna!.burst).toBeUndefined();
    expect(antenna!.windAmp).toBe(1);
  });

  it('renders without errors at multiple windPhase slices', () => {
    const pack = getArenaPack('rooftops');
    const arena = getArena('rooftops');
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
