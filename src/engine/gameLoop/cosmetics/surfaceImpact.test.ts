import { describe, it, expect } from 'vitest';
import type { Arena, MatchState, Player } from '../../types';
import { makePlayer, makeArena, makeState } from '../../__tests__/testHelpers';
import {
  detectSurfaceImpact,
  isInLavaZone,
  pushSurfaceDecal,
  pushRipple,
  updateSurfaceLifetimes,
  snapshotSurfaceImpactState,
  type PrevSurfaceImpactState,
  type SurfaceImpactCallbacks,
} from './surfaceImpact';
import { SURFACE_DECAL_MAX, HARD_LAND_VY_THRESHOLD } from '../../constants';

function makeCb(overrides: Partial<SurfaceImpactCallbacks> = {}): SurfaceImpactCallbacks {
  return {
    isSlowDevice: () => false,
    ...overrides,
  };
}
const cb = makeCb();

function makeImpactArena(opts: { defaultSurface?: Arena['defaultSurface']; iceCubeAt?: number } = {}): Arena {
  const arena = makeArena({
    platforms: [
      { x: 0, y: 660, width: 1280, height: 60, surface: opts.iceCubeAt === 0 ? 'ice' : undefined },
      { x: 200, y: 500, width: 200, height: 24, surface: opts.iceCubeAt === 1 ? 'glass' : undefined },
    ],
  });
  arena.defaultSurface = opts.defaultSurface ?? 'grass';
  return arena;
}

function makeFallingPlayer(x = 100, y = 658, vy = 700, fastFalling = false): Player {
  const p = makePlayer({ id: 'P1' });
  p.x = x;
  p.y = y;
  p.state = 'airborne';
  p.vy = vy;
  p.fastFalling = fastFalling;
  return p;
}

function makeLandedPlayer(x = 100, y = 660): Player {
  const p = makePlayer({ id: 'P1' });
  p.x = x;
  p.y = y - p.height;
  p.state = 'idle';
  p.vy = 0;
  return p;
}

describe('surfaceImpact — pure helpers', () => {
  it('isInLavaZone detects player center inside a lava hazardZone', () => {
    const arena = makeArena({
      hazardZones: [{ type: 'lava', x: 100, y: 600, width: 200, height: 100 }],
    });
    const inside = makePlayer({ id: 'P1' });
    inside.x = 180; inside.y = 650;
    expect(isInLavaZone(inside, arena)).toBe(true);

    const outside = makePlayer({ id: 'P1' });
    outside.x = 50; outside.y = 650;
    expect(isInLavaZone(outside, arena)).toBe(false);
  });

  it('pushSurfaceDecal evicts oldest at SURFACE_DECAL_MAX cap', () => {
    const state = makeState();
    for (let i = 0; i < SURFACE_DECAL_MAX + 5; i++) {
      pushSurfaceDecal(state, {
        kind: 'mini', x: i, y: 0, life: 5, seed: 0, color: '#000', surface: 'grass',
      });
    }
    expect(state.surfaceDecals.length).toBe(SURFACE_DECAL_MAX);
    // Oldest 5 evicted; first remaining decal should have x=5
    expect(state.surfaceDecals[0].x).toBe(5);
  });

  it('pushSurfaceDecal skips when life <= 0', () => {
    const state = makeState();
    pushSurfaceDecal(state, {
      kind: 'full', x: 0, y: 0, life: 0, seed: 0, color: '#000', surface: 'grass',
    });
    expect(state.surfaceDecals.length).toBe(0);
  });

  it('pushRipple appends to state.ripples with full life', () => {
    const state = makeState();
    pushRipple(state, 100, 200, 'lava');
    expect(state.ripples.length).toBe(1);
    expect(state.ripples[0]).toMatchObject({ x: 100, y: 200, surface: 'lava', age: 0 });
    expect(state.ripples[0].age).toBe(0);
  });

  it('updateSurfaceLifetimes ages and culls expired decals/ripples', () => {
    const state = makeState();
    pushSurfaceDecal(state, {
      kind: 'mini', x: 0, y: 0, life: 1, seed: 0, color: '#000', surface: 'grass',
    });
    pushRipple(state, 0, 0, 'lava');

    updateSurfaceLifetimes(state, 0.5);
    expect(state.surfaceDecals.length).toBe(1);
    expect(state.surfaceDecals[0].age).toBeCloseTo(0.5);

    // Push past lifetime
    updateSurfaceLifetimes(state, 5);
    expect(state.surfaceDecals.length).toBe(0);
    expect(state.ripples.length).toBe(0);
  });
});

describe('detectSurfaceImpact — landing transitions', () => {
  it('hard landing on grass → scuff decal, no crack', () => {
    const arena = makeImpactArena({ defaultSurface: 'grass' });
    const state = makeState();
    const player = makeLandedPlayer(640, 660);
    state.players = [player];
    const prev: PrevSurfaceImpactState = {
      state: 'airborne', vy: HARD_LAND_VY_THRESHOLD + 50, inLava: false, fastFalling: false,
    };

    detectSurfaceImpact(player, prev, state, arena, cb);

    const mini = state.surfaceDecals.filter(d => d.kind === 'mini');
    const full = state.surfaceDecals.filter(d => d.kind === 'full');
    expect(mini.length).toBe(1);
    expect(full.length).toBe(0);
    expect(mini[0].surface).toBe('grass');
  });

  it('hard landing on ice → single full-spider crack decal (no minicrack)', () => {
    const arena = makeImpactArena({ iceCubeAt: 0 });
    const state = makeState();
    const player = makeLandedPlayer(640, 660);
    state.players = [player];
    const prev: PrevSurfaceImpactState = {
      state: 'airborne', vy: HARD_LAND_VY_THRESHOLD + 50, inLava: false, fastFalling: true,
    };

    detectSurfaceImpact(player, prev, state, arena, cb);

    const mini = state.surfaceDecals.filter(d => d.kind === 'mini');
    const full = state.surfaceDecals.filter(d => d.kind === 'full');
    expect(mini.length).toBe(0);
    expect(full.length).toBe(1);
    expect(full[0].surface).toBe('ice');
  });

  it('soft landing (low vy, no fastFall) does NOT spawn scuff decal', () => {
    const arena = makeImpactArena({ defaultSurface: 'grass' });
    const state = makeState();
    const player = makeLandedPlayer(640, 660);
    state.players = [player];
    // vy below HARD_LAND_VY_THRESHOLD AND not fastFalling
    const prev: PrevSurfaceImpactState = {
      state: 'airborne', vy: 350, inLava: false, fastFalling: false,
    };

    detectSurfaceImpact(player, prev, state, arena, cb);

    expect(state.surfaceDecals.length).toBe(0);
  });

  it('slow-device falls back to minicrack on ice (no full spider)', () => {
    const arena = makeImpactArena({ iceCubeAt: 0 });
    const state = makeState();
    const player = makeLandedPlayer(640, 660);
    state.players = [player];
    const prev: PrevSurfaceImpactState = {
      state: 'airborne', vy: HARD_LAND_VY_THRESHOLD + 100, inLava: false, fastFalling: true,
    };

    detectSurfaceImpact(player, prev, state, arena, makeCb({ isSlowDevice: () => true }));

    const mini = state.surfaceDecals.filter(d => d.kind === 'mini');
    const full = state.surfaceDecals.filter(d => d.kind === 'full');
    expect(mini.length).toBe(1);
    expect(full.length).toBe(0);
  });
});

describe('detectSurfaceImpact — edge clipping', () => {
  it('decal carries clip extent matching the platform under impact', () => {
    const arena = makeImpactArena({ defaultSurface: 'grass' });
    const state = makeState();
    // Player at the small floating platform (200..400). Test platform has no
    // leftCollisionInset so clip extent matches plat.x..plat.x+width directly.
    const player = makeLandedPlayer(300, 500);
    state.players = [player];
    const prev: PrevSurfaceImpactState = {
      state: 'airborne', vy: HARD_LAND_VY_THRESHOLD + 50, inLava: false, fastFalling: false,
    };

    detectSurfaceImpact(player, prev, state, arena, cb);

    const mini = state.surfaceDecals.find(d => d.kind === 'mini');
    expect(mini?.clipMinX).toBe(200);
    expect(mini?.clipMaxX).toBe(400);
  });
});

describe('detectSurfaceImpact — lava ripples', () => {
  it('rising-edge entry into lava zone → ripple', () => {
    const arena = makeArena({
      hazardZones: [{ type: 'lava', x: 100, y: 600, width: 200, height: 100 }],
    });
    const state = makeState();
    const player = makePlayer({ id: 'P1' });
    player.x = 180; player.y = 640; player.state = 'airborne';
    state.players = [player];

    const prev: PrevSurfaceImpactState = {
      state: 'airborne', vy: 0, inLava: false, fastFalling: false,
    };

    detectSurfaceImpact(player, prev, state, arena, cb);

    const lavaRipples = state.ripples.filter(r => r.surface === 'lava');
    expect(lavaRipples.length).toBe(1);
  });

  it('continued lava presence (no rising edge) does NOT spawn another ripple', () => {
    const arena = makeArena({
      hazardZones: [{ type: 'lava', x: 100, y: 600, width: 200, height: 100 }],
    });
    const state = makeState();
    const player = makePlayer({ id: 'P1' });
    player.x = 180; player.y = 640; player.state = 'airborne';
    state.players = [player];

    const prev: PrevSurfaceImpactState = {
      state: 'airborne', vy: 0, inLava: true, fastFalling: false,
    };

    detectSurfaceImpact(player, prev, state, arena, cb);

    expect(state.ripples.length).toBe(0);
  });
});

describe('snapshotSurfaceImpactState', () => {
  it('captures state, vy, inLava, fastFalling', () => {
    const arena = makeArena();
    const player = makeFallingPlayer(100, 200, 500, true);
    const snap = snapshotSurfaceImpactState(player, arena);
    expect(snap).toEqual({
      state: 'airborne', vy: 500, inLava: false, fastFalling: true,
    });
  });
});
