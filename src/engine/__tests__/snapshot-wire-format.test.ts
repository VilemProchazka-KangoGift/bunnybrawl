/**
 * Golden-bytes regression test for the host-authoritative snapshot wire format.
 *
 * This test locks the EXACT byte sequence produced by takeAuthSnapshot() +
 * encodeSnapshot() for a deterministic input. It exists to catch any
 * accidental wire-format change during refactors — the wire format is
 * guarded by PROTOCOL_VERSION and a wire-format change requires a version
 * bump.
 *
 * If this snapshot needs to be regenerated:
 *   1. CONFIRM the wire format is intentionally changing.
 *   2. CONFIRM PROTOCOL_VERSION has been bumped in net/core/protocol.ts.
 *   3. Run: npx vitest run src/engine/__tests__/snapshot-wire-format.test.ts -u
 *   4. Review the diff carefully — every byte change is a wire-format change.
 *
 * Coverage:
 *   - 2 players (P1, B1) with different facing/state/expression/timer combos
 *   - At least one disconnected player
 *   - Non-zero invincibleTimer, slowTimer, burnTimer, damageFlashTimer (Uint8 frames)
 *   - Negative-timer / Uint8 wraparound case (encodeTimer must clamp <=0 to 0)
 *   - Carrots (active flags via packed bools), springs, thorns, ghosts,
 *     lavaRocks, geyserStates, killFeed, scoreAnimations
 *   - Non-zero totalKills (Uint16)
 *   - matchOver=true with winner=P1, phase='over' (tests phaseBits + flag overlap)
 *   - dayPhase, screenShake, slowMotion, screenFlash, hitstopZoom non-zero
 */
import { describe, it, expect } from 'vitest';
import {
  takeAuthSnapshot,
  encodeSnapshot,
  decodeSnapshot,
} from '../net/snapshot';
import type { MatchState, PlayerSlot } from '../types';

/** Hex stringifier: groups of 16 bytes per line for readability. */
function bytesToHexLines(buf: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < buf.length; i += 16) {
    const slice = buf.subarray(i, Math.min(i + 16, buf.length));
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    lines.push(`${i.toString(16).padStart(4, '0')}: ${hex}`);
  }
  return lines.join('\n');
}

/** Fixed-shape MatchState fixture. NO Math.random(), NO Date.now(), NO Map ordering surprises. */
function makeFixtureState(): MatchState {
  return {
    phase: 'over',
    players: [
      {
        id: 'P1' as PlayerSlot,
        x: 123.5,
        y: 456.25,
        vx: 50,
        vy: -120,
        state: 'run',
        facing: 'right',
        animFrame: 7,
        score: 12,
        hitstopTimer: 0,
        invincibleTimer: 1.5,            // 90 frames
        fastFalling: false,
        splatTimer: 0,
        respawnTimer: 0,
        fatTimer: 0,
        slowTimer: 0.5,                  // 30 frames
        burnTimer: 0.25,                 // 15 frames
        squashScale: 1,
        expression: 'angry',
        killStreak: 3,
        disconnected: false,
        active: true,
        width: 32,
        height: 32,
        sideSquash: 1,
        damageFlashTimer: 0.1,           // 6 frames
        damageFlashSide: 'right',
      },
      {
        // Disconnected player + negative-timer Uint8 wraparound exercise.
        // encodeTimer() must clamp values <= 0 to 0 — otherwise a tiny
        // Math.fround() negative drift wraps to 255 and produces a permanent
        // visual artifact on the guest.
        id: 'B1' as PlayerSlot,
        x: 800,
        y: 300,
        vx: 0,
        vy: 0,
        state: 'idle',
        facing: 'left',
        animFrame: 0,
        score: 4,
        hitstopTimer: -0.0001,           // wraparound trap — must encode as 0
        invincibleTimer: 0,
        fastFalling: true,
        splatTimer: 0,
        respawnTimer: 0,
        fatTimer: 0,
        slowTimer: -0.05,                // wraparound trap — must encode as 0
        burnTimer: 0,
        squashScale: 0.8,
        expression: 'scared',
        killStreak: 0,
        disconnected: true,              // <-- must propagate to wire
        active: true,
        width: 32,
        height: 32,
        sideSquash: 0.8,
        damageFlashTimer: 0,
        damageFlashSide: null,
      },
    ],
    carrots: [
      { x: 400, y: 350, active: true },
      { x: 600, y: 350, active: false },
      { x: 800, y: 350, active: true },
    ],
    springs: [
      { x: 320, y: 640, bounceTimer: 0.1, life: 5, growTimer: 0.3 },
    ],
    thorns: [
      { x: 900, y: 640, life: 8, growTimer: 0, hit: false },
      { x: 1100, y: 640, life: 6, growTimer: 0, hit: true },
    ],
    ghosts: [
      { x: 700, y: 400, vx: -30, wobblePhase: 1.25 },
    ],
    lavaRocks: [
      { x: 500, y: 200, vy: 250, active: true },
    ],
    geyserStates: [
      { timer: 1.5, active: false, activeTimer: 0 },
      { timer: 0.25, active: true, activeTimer: 0.5 },
    ],
    killFeed: [
      { attacker: 'P1' as PlayerSlot, victim: 'B1' as PlayerSlot, timestamp: 12.5 },
      { attacker: 'P1' as PlayerSlot, victim: 'B1' as PlayerSlot, timestamp: 17.0 },
    ],
    totalKills: 27,
    timeElapsed: 42.5,
    countdown: 0,
    dayPhase: 0.25,
    matchOver: true,
    winner: 'P1' as PlayerSlot,
    screenShake: 0.4,
    slowMotion: 0.2,
    screenFlash: 0.15,
    hitstopZoom: 1.05,
    scoreAnimations: [
      { playerId: 'P1' as PlayerSlot, value: 2, timer: 0.4 },
    ],
  } as unknown as MatchState;
}

describe('snapshot wire format (golden bytes)', () => {
  it('encodes a known MatchState to a byte-identical buffer', () => {
    const state = makeFixtureState();
    const snap = takeAuthSnapshot(42, state);
    const { buffer, length } = encodeSnapshot(snap);
    // Copy out of the shared encode buffer before snapshotting.
    const bytes = new Uint8Array(buffer.slice(0, length));
    const dump = `len=${length}\n${bytesToHexLines(bytes)}\n`;
    expect(dump).toMatchSnapshot();
  });

  it('round-trips through decodeSnapshot with field-level equality (within Uint8 timer tolerance)', () => {
    const state = makeFixtureState();
    const snap = takeAuthSnapshot(42, state);
    const { buffer, length } = encodeSnapshot(snap);
    // decodeSnapshot needs a fresh copy — the encode buffer is shared.
    const copy = buffer.slice(0, length);
    const decoded = decodeSnapshot(copy);
    expect(decoded).not.toBeNull();

    expect(decoded!.frame).toBe(42);
    expect(decoded!.phase).toBe('over');
    expect(decoded!.matchOver).toBe(true);
    expect(decoded!.winner).toBe('P1');
    expect(decoded!.totalKills).toBe(27);

    // Player 0 (P1)
    expect(decoded!.players).toHaveLength(2);
    const p1 = decoded!.players[0];
    expect(p1.id).toBe('P1');
    expect(p1.x).toBeCloseTo(123.5, 1);
    expect(p1.y).toBeCloseTo(456.25, 1);
    expect(p1.state).toBe('run');
    expect(p1.facing).toBe('right');
    expect(p1.expression).toBe('angry');
    expect(p1.score).toBe(12);
    expect(p1.killStreak).toBe(3);
    expect(p1.disconnected).toBe(false);
    expect(p1.active).toBe(true);
    expect(p1.fastFalling).toBe(false);
    // Timers — Uint8 frames, ±1/60s tolerance
    expect(p1.invincibleTimer).toBeCloseTo(1.5, 1);
    expect(p1.slowTimer).toBeCloseTo(0.5, 1);
    expect(p1.burnTimer).toBeCloseTo(0.25, 1);
    expect(p1.damageFlashTimer).toBeCloseTo(0.1, 1);
    expect(p1.damageFlashSide).toBe('right');

    // Player 1 (B1) — wraparound trap: negative timers must decode as 0
    const b1 = decoded!.players[1];
    expect(b1.id).toBe('B1');
    expect(b1.disconnected).toBe(true);
    expect(b1.fastFalling).toBe(true);
    expect(b1.expression).toBe('scared');
    expect(b1.facing).toBe('left');
    // CRITICAL: negative timers must NOT wrap to ~4.25s (255/60).
    // encodeTimer() clamps <=0 to 0; decode reads 0; round-trip must be 0.
    expect(b1.hitstopTimer).toBe(0);
    expect(b1.slowTimer).toBe(0);
    expect(b1.damageFlashSide).toBeNull();
    expect(b1.squashScale).toBeCloseTo(0.8, 1);
    expect(b1.sideSquash).toBeCloseTo(0.8, 1);

    // Entities — counts & key flags
    expect(decoded!.carrots).toHaveLength(3);
    expect(decoded!.carrots[0].active).toBe(true);
    expect(decoded!.carrots[1].active).toBe(false);
    expect(decoded!.carrots[2].active).toBe(true);

    expect(decoded!.springs).toHaveLength(1);
    expect(decoded!.thorns).toHaveLength(2);
    expect(decoded!.thorns[0].hit).toBe(false);
    expect(decoded!.thorns[1].hit).toBe(true);
    expect(decoded!.ghosts).toHaveLength(1);
    expect(decoded!.lavaRocks).toHaveLength(1);
    expect(decoded!.lavaRocks[0].active).toBe(true);
    expect(decoded!.geyserStates).toHaveLength(2);
    expect(decoded!.geyserStates[0].active).toBe(false);
    expect(decoded!.geyserStates[1].active).toBe(true);

    expect(decoded!.killFeed).toHaveLength(2);
    expect(decoded!.scoreAnimations).toHaveLength(1);

    // Globals
    expect(decoded!.timeElapsed).toBeCloseTo(42.5, 1);
    expect(decoded!.dayPhase).toBeCloseTo(0.25, 2);
    expect(decoded!.screenShake).toBeCloseTo(0.4, 1);
    expect(decoded!.slowMotion).toBeCloseTo(0.2, 1);
    expect(decoded!.screenFlash).toBeCloseTo(0.15, 1);
    expect(decoded!.hitstopZoom).toBeCloseTo(1.05, 1);
  });
});
