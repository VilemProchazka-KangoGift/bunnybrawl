import { describe, it, expect } from 'vitest';
import { encodeSnapshot, decodeSnapshot, takeAuthSnapshot } from './snapshot';
import type { AuthSnapshot } from './snapshot';
import type { MatchState, PlayerSlot } from '../types';

function makeTestSnapshot(frame = 1): AuthSnapshot {
  return {
    frame,
    phase: 'playing',
    players: [
      { id: 'P1' as PlayerSlot, x: 100.5, y: 200.25, vx: 50, vy: -100, state: 'run', facing: 'right', animFrame: 3, score: 5, hitstopTimer: 0.1, invincibleTimer: 1.5, fastFalling: false, splatTimer: 0, respawnTimer: 0, fatTimer: 0.5, slowTimer: 0, burnTimer: 0, squashScale: 1, expression: 'normal', killStreak: 2, disconnected: false, active: true, width: 32, height: 32 },
      { id: 'B1' as PlayerSlot, x: 500, y: 300, vx: 0, vy: 0, state: 'idle', facing: 'left', animFrame: 0, score: 3, hitstopTimer: 0, invincibleTimer: 0, fastFalling: true, splatTimer: 0, respawnTimer: 0, fatTimer: 0, slowTimer: 0.2, burnTimer: 0.3, squashScale: 0.8, expression: 'scared', killStreak: 0, disconnected: false, active: true, width: 32, height: 32 },
    ],
    carrots: [
      { x: 640, y: 350, active: true },
      { x: 200, y: 500, active: false },
    ],
    springs: [
      { x: 400, y: 640, bounceTimer: 0.1, life: 5, growTimer: 0.3 },
    ],
    thorns: [
      { x: 800, y: 640, life: 8, growTimer: 0, hit: false },
    ],
    ghosts: [
      { x: 600, y: 400, vx: -30, wobblePhase: 1.5 },
    ],
    lavaRocks: [
      { x: 300, y: 100, vy: 200, active: true },
    ],
    geyserStates: [
      { timer: 2.5, active: false, activeTimer: 0 },
    ],
    killFeed: [
      { attacker: 'P1' as PlayerSlot, victim: 'B1' as PlayerSlot, timestamp: 10.5 },
    ],
    timeElapsed: 15.3,
    countdown: 0,
    dayPhase: 0.25,
    matchOver: false,
    winner: null,
    screenShake: 0.1,
    slowMotion: 0,
    screenFlash: 0,
    hitstopZoom: 0,
    scoreAnimations: [
      { playerId: 'P1' as PlayerSlot, value: 2, timer: 0.5 },
    ],
  };
}

describe('snapshot encode/decode round-trip', () => {
  it('encodes and decodes a snapshot preserving all fields', () => {
    const original = makeTestSnapshot(42);
    const { buffer, length } = encodeSnapshot(original);
    const encoded = buffer.slice(0, length); // copy from shared buffer
    const decoded = decodeSnapshot(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.frame).toBe(42);

    // Players
    expect(decoded!.players).toHaveLength(2);
    const p1 = decoded!.players[0];
    expect(p1.id).toBe('P1');
    expect(p1.x).toBeCloseTo(100.5, 0); // float32 precision
    expect(p1.y).toBeCloseTo(200.25, 0);
    expect(p1.vx).toBeCloseTo(50, 0);
    expect(p1.vy).toBeCloseTo(-100, 0);
    expect(p1.state).toBe('run');
    expect(p1.facing).toBe('right');
    expect(p1.animFrame).toBe(3);
    expect(p1.score).toBe(5);
    expect(p1.killStreak).toBe(2);
    expect(p1.active).toBe(true);
    expect(p1.disconnected).toBe(false);
    expect(p1.fastFalling).toBe(false);
    expect(p1.expression).toBe('normal');

    const b1 = decoded!.players[1];
    expect(b1.id).toBe('B1');
    expect(b1.state).toBe('idle');
    expect(b1.facing).toBe('left');
    expect(b1.fastFalling).toBe(true);
    expect(b1.expression).toBe('scared');
    expect(b1.squashScale).toBeCloseTo(0.8, 1);

    // Entities
    expect(decoded!.carrots).toHaveLength(2);
    expect(decoded!.carrots[0].active).toBe(true);
    expect(decoded!.carrots[1].active).toBe(false);

    expect(decoded!.springs).toHaveLength(1);
    expect(decoded!.springs[0].x).toBeCloseTo(400, 0);

    expect(decoded!.thorns).toHaveLength(1);
    expect(decoded!.thorns[0].hit).toBe(false);

    expect(decoded!.ghosts).toHaveLength(1);
    expect(decoded!.ghosts[0].vx).toBeCloseTo(-30, 0);

    expect(decoded!.lavaRocks).toHaveLength(1);
    expect(decoded!.lavaRocks[0].active).toBe(true);

    expect(decoded!.geyserStates).toHaveLength(1);
    expect(decoded!.geyserStates[0].active).toBe(false);

    // Kill feed
    expect(decoded!.killFeed).toHaveLength(1);
    expect(decoded!.killFeed[0].attacker).toBe('P1');
    expect(decoded!.killFeed[0].victim).toBe('B1');

    // Global
    expect(decoded!.timeElapsed).toBeCloseTo(15.3, 0);
    expect(decoded!.dayPhase).toBeCloseTo(0.25, 1);
    expect(decoded!.matchOver).toBe(false);
    expect(decoded!.winner).toBeNull();

    // Score animations
    expect(decoded!.scoreAnimations).toHaveLength(1);
    expect(decoded!.scoreAnimations[0].playerId).toBe('P1');
  });

  it('handles empty snapshot (no entities)', () => {
    const snap: AuthSnapshot = {
      frame: 1,
      phase: 'loading',
      players: [],
      carrots: [],
      springs: [],
      thorns: [],
      ghosts: [],
      lavaRocks: [],
      geyserStates: [],
      killFeed: [],
      timeElapsed: 0,
      countdown: 3,
      dayPhase: 0,
      matchOver: false,
      winner: null,
      screenShake: 0,
      slowMotion: 0,
      screenFlash: 0,
      hitstopZoom: 0,
      scoreAnimations: [],
    };
    const { buffer, length } = encodeSnapshot(snap);
    const decoded = decodeSnapshot(buffer.slice(0, length));
    expect(decoded).not.toBeNull();
    expect(decoded!.players).toHaveLength(0);
    expect(decoded!.carrots).toHaveLength(0);
    expect(decoded!.countdown).toBeCloseTo(3, 0);
  });

  it('handles matchOver with winner', () => {
    const snap = makeTestSnapshot(100);
    snap.matchOver = true;
    snap.winner = 'P1' as PlayerSlot;
    const { buffer, length } = encodeSnapshot(snap);
    const decoded = decodeSnapshot(buffer.slice(0, length));
    expect(decoded!.matchOver).toBe(true);
    expect(decoded!.winner).toBe('P1');
  });

  it('preserves phase = "loading" through encode/decode', () => {
    const snap = makeTestSnapshot(1);
    snap.phase = 'loading';
    const { buffer, length } = encodeSnapshot(snap);
    const decoded = decodeSnapshot(buffer.slice(0, length));
    expect(decoded!.phase).toBe('loading');
  });

  it('preserves phase = "playing" through encode/decode', () => {
    const snap = makeTestSnapshot(1);
    snap.phase = 'playing';
    const { buffer, length } = encodeSnapshot(snap);
    const decoded = decodeSnapshot(buffer.slice(0, length));
    expect(decoded!.phase).toBe('playing');
  });

  it('preserves phase = "over" through encode/decode', () => {
    const snap = makeTestSnapshot(1);
    snap.phase = 'over';
    const { buffer, length } = encodeSnapshot(snap);
    const decoded = decodeSnapshot(buffer.slice(0, length));
    expect(decoded!.phase).toBe('over');
  });

  it('phase bits do not interfere with matchOver/winner flags', () => {
    // Phase 'over' (bits 2-3 = 10) AND matchOver (bit 0) AND winner (bit 1)
    const snap = makeTestSnapshot(1);
    snap.phase = 'over';
    snap.matchOver = true;
    snap.winner = 'B1' as PlayerSlot;
    const { buffer, length } = encodeSnapshot(snap);
    const decoded = decodeSnapshot(buffer.slice(0, length));
    expect(decoded!.phase).toBe('over');
    expect(decoded!.matchOver).toBe(true);
    expect(decoded!.winner).toBe('B1');
  });

  it('preserves timer precision within uint8 range', () => {
    const snap = makeTestSnapshot(1);
    snap.players[0].hitstopTimer = 0.1; // 6 frames
    snap.players[0].invincibleTimer = 1.5; // 90 frames
    const { buffer, length } = encodeSnapshot(snap);
    const decoded = decodeSnapshot(buffer.slice(0, length));
    // Timers encoded as uint8 frames (÷60), so precision is 1/60s
    expect(decoded!.players[0].hitstopTimer).toBeCloseTo(0.1, 1);
    expect(decoded!.players[0].invincibleTimer).toBeCloseTo(1.5, 1);
  });

  it('rejects buffer that is too small', () => {
    const buf = new ArrayBuffer(3);
    expect(decodeSnapshot(buf)).toBeNull();
  });

  it('round-trips totalKills (the source of truth for VictoryScreen total-splats)', () => {
    // Counter must survive the wire — host shows trimmed killFeed (10),
    // guest shows trimmed killFeed (5), but VictoryScreen reads totalKills
    // which should equal the actual stomp count regardless of trimming.
    const snap = makeTestSnapshot(1);
    snap.totalKills = 27;
    const { buffer, length } = encodeSnapshot(snap);
    const decoded = decodeSnapshot(buffer.slice(0, length));
    expect(decoded!.totalKills).toBe(27);
  });

  it('clamps totalKills to Uint16 max on encode', () => {
    const snap = makeTestSnapshot(1);
    snap.totalKills = 70000; // beyond Uint16
    const { buffer, length } = encodeSnapshot(snap);
    const decoded = decodeSnapshot(buffer.slice(0, length));
    expect(decoded!.totalKills).toBe(65535);
  });

  it('encodeSnapshot returns shared buffer (caller must copy)', () => {
    const snap1 = makeTestSnapshot(1);
    const snap2 = makeTestSnapshot(2);
    const result1 = encodeSnapshot(snap1);
    const result2 = encodeSnapshot(snap2);
    // Both return the same underlying buffer
    expect(result1.buffer).toBe(result2.buffer);
    // But lengths may differ
    expect(result1.length).toBeGreaterThan(0);
    expect(result2.length).toBeGreaterThan(0);
  });
});

describe('takeAuthSnapshot', () => {
  it('extracts snapshot from MatchState', () => {
    const state = {
      phase: 'playing',
      players: [
        { id: 'P1', x: 100, y: 200, vx: 10, vy: -5, state: 'run', facing: 'right', animFrame: 1, score: 3, hitstopTimer: 0, invincibleTimer: 0, fastFalling: false, splatTimer: 0, respawnTimer: 0, fatTimer: 0, slowTimer: 0, burnTimer: 0, squashScale: 1, expression: 'normal', killStreak: 1, disconnected: false, active: true, width: 32, height: 32, character: {} },
      ],
      carrots: [{ x: 300, y: 400, active: true, spawnTime: 0 }],
      springs: [],
      thorns: [],
      ghosts: [],
      lavaRocks: [],
      geyserStates: [],
      killFeed: [],
      timeElapsed: 5,
      countdown: 0,
      dayPhase: 0.1,
      matchOver: false,
      winner: null,
      screenShake: 0,
      slowMotion: 0,
      screenFlash: 0,
      hitstopZoom: 0,
      scoreAnimations: [],
    } as unknown as MatchState;

    const snap = takeAuthSnapshot(10, state);
    expect(snap.frame).toBe(10);
    expect(snap.players).toHaveLength(1);
    expect(snap.players[0].x).toBe(100);
    expect(snap.carrots).toHaveLength(1);
    expect(snap.timeElapsed).toBe(5);
  });
});
