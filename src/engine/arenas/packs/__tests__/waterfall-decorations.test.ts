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

describe('waterfall — buildReactiveDecorations', () => {
  it('builds a non-empty instance list', () => {
    const pack = getArenaPack('waterfall');
    expect(pack).toBeDefined();
    const arena = getArena('waterfall');
    const list = pack!.buildReactiveDecorations!(arena);
    // 2 trees + 4 tallGrass + 4 ferns + 4 fgBush sides + N platform fgBushes/vines + 4 frogs
    expect(list.length).toBeGreaterThan(20);
  });

  it('every instance has a registered kind', () => {
    const pack = getArenaPack('waterfall');
    const arena = getArena('waterfall');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(hasReactiveKind(inst.kind)).toBe(true);
    }
  });

  it('every instance position is within sane bounds', () => {
    const pack = getArenaPack('waterfall');
    const arena = getArena('waterfall');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(inst.pos.x).toBeGreaterThanOrEqual(-50);
      expect(inst.pos.x).toBeLessThanOrEqual(arena.width + 50);
      expect(inst.pos.y).toBeGreaterThanOrEqual(0);
      expect(inst.pos.y).toBeLessThanOrEqual(arena.height + 50);
    }
  });

  it('expected kinds are present', () => {
    const expected = [
      'waterfall.tree', 'decoration.tallGrass', 'decoration.fern',
      'decoration.hangingVine', 'waterfall.fgBush', 'waterfall.frogJump',
    ];
    for (const k of expected) {
      expect(hasReactiveKind(k)).toBe(true);
    }
  });

  it('frogs register on postPlayer layer with excite-mode proximity', () => {
    const frog = getReactiveKind('waterfall.frogJump');
    expect(frog?.layer).toBe('postPlayer');
    const pack = getArenaPack('waterfall');
    const arena = getArena('waterfall');
    const list = pack!.buildReactiveDecorations!(arena);
    const frogs = list.filter((i) => i.kind === 'waterfall.frogJump');
    expect(frogs.length).toBe(4); // one per LILY_PADS entry
    for (const f of frogs) {
      expect(f.proximity?.mode).toBe('excite');
      expect(f.proximity?.radius).toBe(60);
    }
  });

  it('trees configure stomp-shake + leaf burst', () => {
    const pack = getArenaPack('waterfall');
    const arena = getArena('waterfall');
    const list = pack!.buildReactiveDecorations!(arena);
    const trees = list.filter((i) => i.kind === 'waterfall.tree');
    expect(trees.length).toBe(2);
    for (const t of trees) {
      expect(t.shakeRadius).toBe(80);
      expect(t.burst?.threshold).toBe(0.95);
      expect(t.burst?.particleKind).toBe('leaf');
      expect(t.burst?.count).toBe(12);
    }
  });

  it('tallGrass + fern + hangingVine + fgBush configure proximity-lean', () => {
    const pack = getArenaPack('waterfall');
    const arena = getArena('waterfall');
    const list = pack!.buildReactiveDecorations!(arena);
    const tg = list.find((i) => i.kind === 'decoration.tallGrass');
    expect(tg?.proximity?.mode).toBe('lean');
    expect(tg?.proximity?.magnitude).toBe(30);
    const fern = list.find((i) => i.kind === 'decoration.fern');
    expect(fern?.proximity?.mode).toBe('lean');
    expect(fern?.proximity?.magnitude).toBe(24);
    const vine = list.find((i) => i.kind === 'decoration.hangingVine');
    expect(vine?.proximity?.mode).toBe('lean');
    expect(vine?.proximity?.magnitude).toBe(30);
    const bush = list.find((i) => i.kind === 'waterfall.fgBush');
    expect(bush?.proximity?.mode).toBe('lean');
    expect(bush?.proximity?.magnitude).toBe(12);
  });

  it('system.resetBaseline() rewinds frog excitement to 0', () => {
    // Pins the round-3 fix: in-flight frog jumps must reset on guest
    // reconnect / loading→playing edge so peers don't see partial hops.
    // Frog excitement is system-managed (not in `inst.data`), but the
    // ReactiveDecorationSystem clears it via resetBaseline regardless.
    const pack = getArenaPack('waterfall');
    const arena = getArena('waterfall');
    const list = pack!.buildReactiveDecorations!(arena);
    const sys = new ReactiveDecorationSystem(makeState({ phase: 'playing' }), arena, () => {});
    sys.setInstances(list);
    const frog = list.find((i) => i.kind === 'waterfall.frogJump');
    expect(frog).toBeDefined();
    frog!.excitement = 0.7; // mid-jump
    sys.resetBaseline();
    expect(frog!.excitement).toBe(0);
  });

  it('renders without errors at multiple windPhase slices', () => {
    const pack = getArenaPack('waterfall');
    const arena = getArena('waterfall');
    const list = pack!.buildReactiveDecorations!(arena);
    const ctx = {
      save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
      scale: () => {}, transform: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
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

  it('frog data carries padIndex matching LILY_PADS slot', () => {
    const pack = getArenaPack('waterfall');
    const arena = getArena('waterfall');
    const list = pack!.buildReactiveDecorations!(arena);
    const frogs = list.filter((i) => i.kind === 'waterfall.frogJump');
    const indices = frogs.map((f) => (f.data as { padIndex: number }).padIndex).sort();
    expect(indices).toEqual([0, 1, 2, 3]);
  });
});
