import { describe, it, expect, beforeEach } from 'vitest';
import {
  SHARED_ACTION_IDS, getSharedAction, getActionPool, pickIdleAction, getIdleAction,
  clearIdleActionCache,
} from '../idleActions';
import { registerCharacter } from '../../characters/registry';
import { registerBuiltinCharacters } from '../../characters/builtin';

describe('idleActions', () => {
  beforeEach(() => {
    clearIdleActionCache();
    registerBuiltinCharacters();
  });

  it('exposes the 6 shared actions', () => {
    expect(SHARED_ACTION_IDS).toEqual(['headBob', 'headTilt', 'headShake', 'littleHop', 'stretch', 'lookAround']);
  });

  it('every shared action has a positive duration', () => {
    for (const id of SHARED_ACTION_IDS) {
      const a = getSharedAction(id)!;
      expect(a.duration).toBeGreaterThan(0);
    }
  });

  it('every shared action apply runs without throwing for t in [0, 0.5, 1]', () => {
    const ctx = makeFakeCtx();
    const colors = { color: '#fff', darkColor: '#888', lightColor: '#fff' };
    for (const id of SHARED_ACTION_IDS) {
      const a = getSharedAction(id)!;
      for (const t of [0, 0.5, 1]) {
        const fakePlayer = { facing: 'right' as const };
        expect(() => a.apply(ctx, 100, 100, 32, 40, t, colors, fakePlayer)).not.toThrow();
      }
    }
  });

  it('default pool for a pack with no idleActions field includes all 6 shared actions', () => {
    const pool = getActionPool('Bunny'); // bunny has no idleActions field
    expect(pool.length).toBe(6);
  });

  it('weight of 0 excludes a shared action from the pool', () => {
    registerCharacter({
      name: 'TestExclude', emoji: '!', color: '#fff', darkColor: '#888', lightColor: '#fff',
      customEyes: false,
      idleActions: { weights: { stretch: 0, headShake: 0 } },
      drawSprite: () => {}, drawGib: () => {},
      splatShape: 'circle', gibs: [],
      bodyEllipse: () => ({ cx: 0, cy: 0, rx: 1, ry: 1 }),
    } as Parameters<typeof registerCharacter>[0]);
    clearIdleActionCache();
    const pool = getActionPool('TestExclude');
    expect(pool.length).toBe(4);
    expect(pool.map(a => a.id)).not.toContain('stretch');
    expect(pool.map(a => a.id)).not.toContain('headShake');
  });

  it('custom actions are appended after shared actions', () => {
    registerCharacter({
      name: 'TestCustom', emoji: '!', color: '#fff', darkColor: '#888', lightColor: '#fff',
      customEyes: false,
      idleActions: { custom: [{ id: 'mySig', duration: 1.0, weight: 1, apply: () => {} }] },
      drawSprite: () => {}, drawGib: () => {},
      splatShape: 'circle', gibs: [],
      bodyEllipse: () => ({ cx: 0, cy: 0, rx: 1, ry: 1 }),
    } as Parameters<typeof registerCharacter>[0]);
    clearIdleActionCache();
    const pool = getActionPool('TestCustom');
    expect(pool.length).toBe(7);
    expect(pool[pool.length - 1].id).toBe('mySig');
  });

  it('pickIdleAction returns an entry from the pool with its index', () => {
    const result = pickIdleAction('Bunny');
    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.action.duration).toBeGreaterThan(0);
  });

  it('getIdleAction returns the action at the given index', () => {
    const pool = getActionPool('Bunny');
    const a = getIdleAction('Bunny', 0);
    expect(a).toBe(pool[0]);
  });

  it('getIdleAction returns null for invalid index', () => {
    expect(getIdleAction('Bunny', -1)).toBeNull();
    expect(getIdleAction('Bunny', 99)).toBeNull();
  });
});

function makeFakeCtx(): CanvasRenderingContext2D {
  const noop = () => {};
  return {
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, ellipse: noop, fill: noop, stroke: noop,
    setTransform: noop,
  } as unknown as CanvasRenderingContext2D;
}
