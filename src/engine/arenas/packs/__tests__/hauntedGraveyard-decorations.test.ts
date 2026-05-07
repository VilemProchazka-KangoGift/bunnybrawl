import { describe, it, expect, beforeAll, vi } from 'vitest';
import { registerBuiltinArenas } from '../../builtin';
import { getArenaPack } from '../../registry';
import { getArena } from '../../operations';
import { hasReactiveKind, getReactiveKind } from '../../../gameLoop/cosmetics';

vi.mock('../../../perfFlags', () => ({ getSlowDevice: () => false }));

beforeAll(() => {
  registerBuiltinArenas();
});

describe('haunted_graveyard — buildReactiveDecorations', () => {
  it('builds a non-empty instance list', () => {
    const pack = getArenaPack('haunted_graveyard');
    expect(pack).toBeDefined();
    const arena = getArena('haunted_graveyard');
    const list = pack!.buildReactiveDecorations!(arena);
    // 4 ground dead trees + N platform-top dead trees + N cobwebs (≥4)
    expect(list.length).toBeGreaterThan(8);
  });

  it('every instance has a registered kind', () => {
    const pack = getArenaPack('haunted_graveyard');
    const arena = getArena('haunted_graveyard');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(hasReactiveKind(inst.kind)).toBe(true);
    }
  });

  it('every instance position is within sane bounds', () => {
    const pack = getArenaPack('haunted_graveyard');
    const arena = getArena('haunted_graveyard');
    const list = pack!.buildReactiveDecorations!(arena);
    for (const inst of list) {
      expect(inst.pos.x).toBeGreaterThanOrEqual(-50);
      expect(inst.pos.x).toBeLessThanOrEqual(arena.width + 50);
      expect(inst.pos.y).toBeGreaterThanOrEqual(0);
      expect(inst.pos.y).toBeLessThanOrEqual(arena.height + 100);
    }
  });

  it('expected kinds are present', () => {
    const expected = ['haunted_graveyard.deadTree', 'haunted_graveyard.cobweb'];
    for (const k of expected) {
      expect(hasReactiveKind(k)).toBe(true);
    }
  });

  it('dead trees register on prePlayer with a stomp burst', () => {
    const tree = getReactiveKind('haunted_graveyard.deadTree');
    expect(tree?.layer).toBe('prePlayer');
    // Confirmed via factory presets — burst threshold/count baked into instances.
    const pack = getArenaPack('haunted_graveyard');
    const arena = getArena('haunted_graveyard');
    const list = pack!.buildReactiveDecorations!(arena);
    const trees = list.filter(i => i.kind === 'haunted_graveyard.deadTree');
    expect(trees.length).toBeGreaterThanOrEqual(4);
    for (const t of trees) {
      expect(t.shakeRadius).toBe(90);
      expect(t.burst?.particleKind).toBe('leaf');
      expect(t.burst?.count).toBe(10);
      expect(t.windAmp).toBe(3);
      // No proximity for dead trees (stiff).
      expect(t.proximity).toBeUndefined();
    }
  });

  it('cobwebs register on prePlayer with subtle proximity-lean', () => {
    const web = getReactiveKind('haunted_graveyard.cobweb');
    expect(web?.layer).toBe('prePlayer');
    const pack = getArenaPack('haunted_graveyard');
    const arena = getArena('haunted_graveyard');
    const list = pack!.buildReactiveDecorations!(arena);
    const webs = list.filter(i => i.kind === 'haunted_graveyard.cobweb');
    expect(webs.length).toBeGreaterThanOrEqual(1);
    for (const w of webs) {
      expect(w.proximity?.mode).toBe('lean');
      expect(w.proximity?.radius).toBe(32);
      expect(w.proximity?.magnitude).toBe(14);
      expect(w.windAmp).toBe(3);
    }
  });

  it('renders without errors at multiple windPhase slices', () => {
    const pack = getArenaPack('haunted_graveyard');
    const arena = getArena('haunted_graveyard');
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
