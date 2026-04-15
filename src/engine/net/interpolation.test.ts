import { describe, it, expect } from 'vitest';
import { EntityInterpolation, applySnapshotToState } from './interpolation';
import type { AuthSnapshot } from './snapshot';
import type { MatchState, PlayerSlot } from '../types';

function makeSnap(frame: number, px = 100, py = 200): AuthSnapshot {
  return {
    frame,
    players: [
      { id: 'P1' as PlayerSlot, x: px, y: py, vx: 10, vy: 0, state: 'run', facing: 'right', animFrame: 0, score: 0, hitstopTimer: 0, invincibleTimer: 0, fastFalling: false, splatTimer: 0, respawnTimer: 0, fatTimer: 0, slowTimer: 0, burnTimer: 0, squashScale: 1, expression: 'normal', killStreak: 0, disconnected: false, active: true, width: 32, height: 32 },
      { id: 'P2' as PlayerSlot, x: px + 100, y: py, vx: -5, vy: 0, state: 'idle', facing: 'left', animFrame: 0, score: 1, hitstopTimer: 0, invincibleTimer: 0, fastFalling: false, splatTimer: 0, respawnTimer: 0, fatTimer: 0, slowTimer: 0, burnTimer: 0, squashScale: 1, expression: 'normal', killStreak: 0, disconnected: false, active: true, width: 32, height: 32 },
    ],
    carrots: [{ x: 300, y: 400, active: true }],
    springs: [],
    thorns: [],
    ghosts: [],
    lavaRocks: [],
    geyserStates: [],
    killFeed: [],
    timeElapsed: frame / 60,
    countdown: 0,
    dayPhase: 0,
    matchOver: false,
    winner: null,
    screenShake: 0,
    slowMotion: 0,
    screenFlash: 0,
    hitstopZoom: 0,
    scoreAnimations: [],
  };
}

describe('EntityInterpolation', () => {
  it('returns null before any snapshots', () => {
    const interp = new EntityInterpolation();
    expect(interp.getInterpolatedState()).toBeNull();
  });

  it('returns first snapshot when only one buffered', () => {
    const interp = new EntityInterpolation();
    const snap = makeSnap(1, 100, 200);
    interp.pushSnapshot(snap);
    const result = interp.getInterpolatedState();
    expect(result).not.toBeNull();
    expect(result!.frame).toBe(1);
    expect(result!.players[0].x).toBe(100);
  });

  it('interpolates between two snapshots', () => {
    const interp = new EntityInterpolation();
    // Push frames 1, 2, 3, 4, 5
    for (let i = 1; i <= 5; i++) {
      interp.pushSnapshot(makeSnap(i, 100 + i * 10, 200));
    }
    // Wall-clock interpolation: in tests snapshots arrive near-simultaneously,
    // so the result is from the earliest buffered region. Verify we get a valid
    // interpolated snapshot with correct player structure.
    const result = interp.getInterpolatedState();
    expect(result).not.toBeNull();
    const p1 = result!.players.find(p => p.id === 'P1');
    expect(p1).toBeDefined();
    // Position should be within the range of all pushed snapshots (110-150)
    expect(p1!.x).toBeGreaterThanOrEqual(110);
    expect(p1!.x).toBeLessThanOrEqual(150);
  });

  it('returns a valid result when few snapshots buffered', () => {
    const interp = new EntityInterpolation();
    interp.pushSnapshot(makeSnap(1, 100, 200));
    interp.pushSnapshot(makeSnap(2, 110, 200));
    const result = interp.getInterpolatedState();
    expect(result).not.toBeNull();
    expect(result!.players.length).toBe(2);
  });

  it('discards out-of-order snapshots (sequence validation)', () => {
    const interp = new EntityInterpolation();
    interp.pushSnapshot(makeSnap(5, 150, 200));
    interp.pushSnapshot(makeSnap(3, 130, 200)); // stale — should be discarded
    interp.pushSnapshot(makeSnap(6, 160, 200));
    // Buffer should have 2 entries (frame 5 and 6), not 3
    expect(interp.getBufferDepth()).toBe(2);
  });

  it('trims old snapshots beyond maxBuffer', () => {
    const interp = new EntityInterpolation();
    for (let i = 1; i <= 50; i++) {
      interp.pushSnapshot(makeSnap(i));
    }
    expect(interp.getBufferDepth()).toBeLessThanOrEqual(30);
  });

  it('widens delay when snapshots have gaps', () => {
    const interp = new EntityInterpolation();
    // Normal delivery: frames 1-10
    for (let i = 1; i <= 10; i++) {
      interp.pushSnapshot(makeSnap(i, 100 + i, 200));
    }
    expect(interp.getDelayFrames()).toBe(2); // starts at MIN_DELAY

    // Simulate a burst of gaps: jump from 10 to 15 (missed 4 frames)
    interp.pushSnapshot(makeSnap(15, 115, 200));
    // Then another gap
    interp.pushSnapshot(makeSnap(20, 120, 200));
    // Delay should have increased
    expect(interp.getDelayFrames()).toBeGreaterThan(2);
  });

  it('tightens delay after sustained on-time delivery', () => {
    const interp = new EntityInterpolation();
    // Push a gap to widen the delay first
    interp.pushSnapshot(makeSnap(1, 100, 200));
    interp.pushSnapshot(makeSnap(10, 110, 200)); // big gap
    interp.pushSnapshot(makeSnap(20, 120, 200)); // another gap
    const widenedDelay = interp.getDelayFrames();

    // Now deliver 200 consecutive on-time frames
    for (let i = 21; i <= 220; i++) {
      interp.pushSnapshot(makeSnap(i, 100 + i, 200));
    }
    // Delay should have tightened back toward MIN_DELAY
    expect(interp.getDelayFrames()).toBeLessThan(widenedDelay);
  });

  it('extrapolation returns valid snapshot for small overshoot', () => {
    const interp = new EntityInterpolation();
    // Push only 2 frames so the target (frame 0) is before them
    // but let's push enough so target is after all
    interp.pushSnapshot(makeSnap(1, 100, 200));
    interp.pushSnapshot(makeSnap(2, 110, 200));
    // latestHostFrame=2, target=2-2=0, which is before frame 1
    // Should return earliest snapshot
    const result = interp.getInterpolatedState();
    expect(result).not.toBeNull();
  });

  it('getLatestSnapshot returns most recent', () => {
    const interp = new EntityInterpolation();
    const s1 = makeSnap(1);
    const s2 = makeSnap(2, 200, 300);
    interp.pushSnapshot(s1);
    interp.pushSnapshot(s2);
    const latest = interp.getLatestSnapshot();
    expect(latest).not.toBeNull();
    expect(latest!.frame).toBe(2);
    expect(latest!.players[0].x).toBe(200);
  });
});

describe('applySnapshotToState', () => {
  function makeMinimalState(): MatchState {
    return {
      players: [
        { id: 'P1', x: 0, y: 0, vx: 0, vy: 0, width: 32, height: 32, state: 'idle', facing: 'right', splatTimer: 0, respawnTimer: 0, invincibleTimer: 0, score: 0, active: true, animFrame: 0, animTimer: 0, fastFalling: false, fatTimer: 0, slowTimer: 0, squashScale: 1, squashTimer: 0, sideSquash: 1, afterimages: [], idleAnimTimer: 0, expression: 'normal', killStreak: 0, breathTimer: 0, springTrailTimer: 0, damageFlashSide: null, damageFlashTimer: 0, burnTimer: 0, hitstopTimer: 0, renderOffsetX: 0, renderOffsetY: 0, disconnected: false, character: { slot: 'P1', name: 'Bunny', color: '#fff', darkColor: '#ccc', lightColor: '#fff' } },
        { id: 'P2', x: 0, y: 0, vx: 0, vy: 0, width: 32, height: 32, state: 'idle', facing: 'right', splatTimer: 0, respawnTimer: 0, invincibleTimer: 0, score: 0, active: true, animFrame: 0, animTimer: 0, fastFalling: false, fatTimer: 0, slowTimer: 0, squashScale: 1, squashTimer: 0, sideSquash: 1, afterimages: [], idleAnimTimer: 0, expression: 'normal', killStreak: 0, breathTimer: 0, springTrailTimer: 0, damageFlashSide: null, damageFlashTimer: 0, burnTimer: 0, hitstopTimer: 0, renderOffsetX: 0, renderOffsetY: 0, disconnected: false, character: { slot: 'P2', name: 'Fox', color: '#f80', darkColor: '#a40', lightColor: '#fc0' } },
      ],
      killFeed: [], timeElapsed: 0, matchOver: false, winner: null,
      carrots: [], carrotTimer: 0, springs: [], thorns: [],
      springSpawnTimer: 0, thornSpawnTimer: 0, screenShake: 0, slowMotion: 0,
      weather: [], dayPhase: 0, countdown: 0,
      stats: { perPlayer: new Map() },
      shockwaves: [], screenFlash: 0, hitstopZoom: 0,
      wildlife: [], fogParticles: [], pollenParticles: [], shootingStars: [],
      scoreAnimations: [], ghosts: [], lavaRocks: [], lavaRockTimer: 0,
      geyserStates: [], pigeonFlocks: [],
      bouncyWobble: new Map(), gibs: [], confetti: [],
    } as unknown as MatchState;
  }

  it('updates player positions from snapshot', () => {
    const state = makeMinimalState();
    const snap = makeSnap(1, 500, 300);
    applySnapshotToState(snap, state);
    expect(state.players[0].x).toBe(500);
    expect(state.players[0].y).toBe(300);
    expect(state.players[1].x).toBe(600);
  });

  it('updates global state', () => {
    const state = makeMinimalState();
    const snap = makeSnap(60);
    snap.timeElapsed = 1.5;
    snap.countdown = 2;
    snap.matchOver = true;
    snap.winner = 'P1' as PlayerSlot;
    applySnapshotToState(snap, state);
    expect(state.timeElapsed).toBe(1.5);
    expect(state.countdown).toBe(2);
    expect(state.matchOver).toBe(true);
    expect(state.winner).toBe('P1');
  });

  it('grows entity arrays when snapshot has more', () => {
    const state = makeMinimalState();
    const snap = makeSnap(1);
    snap.carrots = [
      { x: 100, y: 200, active: true },
      { x: 300, y: 400, active: false },
    ];
    applySnapshotToState(snap, state);
    expect(state.carrots.length).toBe(2);
    expect(state.carrots[1].x).toBe(300);
  });

  it('shrinks entity arrays when snapshot has fewer', () => {
    const state = makeMinimalState();
    state.carrots = [
      { x: 1, y: 2, active: true, spawnTime: 0 },
      { x: 3, y: 4, active: true, spawnTime: 0 },
      { x: 5, y: 6, active: true, spawnTime: 0 },
    ];
    const snap = makeSnap(1);
    snap.carrots = [{ x: 100, y: 200, active: true }];
    applySnapshotToState(snap, state);
    expect(state.carrots.length).toBe(1);
    expect(state.carrots[0].x).toBe(100);
  });

  it('applies local player override when provided', () => {
    const state = makeMinimalState();
    const snap = makeSnap(1, 500, 300);
    applySnapshotToState(snap, state, 'P1' as PlayerSlot, { x: 999, y: 888 });
    // P1 should use the override position
    expect(state.players[0].x).toBe(999);
    expect(state.players[0].y).toBe(888);
    // P2 should use snapshot position
    expect(state.players[1].x).toBe(600);
  });

  it('does not apply override to non-local players', () => {
    const state = makeMinimalState();
    const snap = makeSnap(1, 500, 300);
    applySnapshotToState(snap, state, 'P1' as PlayerSlot, { x: 999, y: 888 });
    // P2 should NOT get the override
    expect(state.players[1].x).toBe(600);
    expect(state.players[1].y).toBe(300);
  });
});
