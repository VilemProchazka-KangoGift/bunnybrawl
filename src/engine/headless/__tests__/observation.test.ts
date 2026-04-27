// @vitest-environment node
//
// Observation extractor.
// Pure Node — no browser/audio/renderer imports. Verifies layout, ordering,
// determinism, edge cases (missing slot, oversized buffer), match-context
// block, and expanded self block.

import { describe, it, expect } from 'vitest';
import {
  extractObservation,
  makeObservation,
  OBSERVATION_SIZE,
  OBS_MATCH_CONTEXT_OFFSET,
  OBS_SELF_OFFSET,
  OBS_OPPONENT_OFFSET,
  OBS_CARROT_OFFSET,
  OBS_HAZARD_OFFSET,
  MATCH_CONTEXT_FEATURES,
  SELF_FEATURES,
  PER_OPPONENT_FEATURES,
  PER_CARROT_FEATURES,
  PER_HAZARD_FEATURES,
} from '../observation';
import {
  makePlayer, makeState, makeArena, makeSettings,
} from '../../__tests__/testHelpers';
import type { Carrot, HazardZone } from '../../types';

describe('observation extractor (pure Node)', () => {
  it('throws when the output buffer is too small', () => {
    const state = makeState({ players: [makePlayer({ id: 'P1' })] });
    const arena = makeArena();
    const settings = makeSettings();
    const tooSmall = new Float32Array(OBSERVATION_SIZE - 1);
    expect(() => extractObservation(state, 'P1', arena, settings, tooSmall)).toThrow(/too small/i);
  });

  it('OBSERVATION_SIZE = 98 (10 ctx + 12 self + 48 opp + 12 carrot + 16 hazard)', () => {
    expect(OBSERVATION_SIZE).toBe(98);
    expect(MATCH_CONTEXT_FEATURES).toBe(10);
    expect(SELF_FEATURES).toBe(12);
    expect(PER_OPPONENT_FEATURES).toBe(12);
  });

  it('match-context block is filled even when slot is missing; self/opponent/carrot/hazard zero', () => {
    const state = makeState({ players: [makePlayer({ id: 'P2' })], timeElapsed: 30 });
    const arena = makeArena();
    const settings = makeSettings({
      killLimit: 16,
      timeLimit: 60,
      mods: {
        extremeGore: false, carrotChase: true, giantPlayers: false, turbo: false,
        superBounce: false, mirrorArena: false, underwaterGravity: false,
      },
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    out.fill(7); // sentinel
    extractObservation(state, 'P1', arena, settings, out);

    // Match context populated regardless of slot presence.
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 0]).toBe(1); // carrotChase
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 7]).toBe(0); // killScoreValue_norm = 0 in carrotChase
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 8]).toBeCloseTo(16 / 32, 5);
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 9]).toBeCloseTo(0.5, 5); // 30 / 60

    // Self/opponent/carrot/hazard are all zero (slot not present).
    for (let i = OBS_SELF_OFFSET; i < OBSERVATION_SIZE; i++) {
      expect(out[i]).toBe(0);
    }
  });

  it('encodes the self block: position, velocity, on_ground for idle vs airborne', () => {
    const arena = makeArena({ width: 1280, height: 720 });
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 640, y: 360, vx: 300, vy: -300, state: 'idle' }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    expect(out[OBS_SELF_OFFSET + 0]).toBeCloseTo(0.5, 5);
    expect(out[OBS_SELF_OFFSET + 1]).toBeCloseTo(0.5, 5);
    expect(out[OBS_SELF_OFFSET + 2]).toBeCloseTo(0.5, 5);
    expect(out[OBS_SELF_OFFSET + 3]).toBeCloseTo(-0.5, 5);
    expect(out[OBS_SELF_OFFSET + 4]).toBe(1); // on_ground

    const state2 = makeState({
      players: [
        makePlayer({ id: 'P1', x: 640, y: 360, vx: 0, vy: 0, state: 'airborne' }),
      ],
    });
    const out2 = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state2, 'P1', arena, settings, out2);
    expect(out2[OBS_SELF_OFFSET + 4]).toBe(0); // on_ground = 0 when airborne
  });

  it('orders opponents by slot id alphabetically and marks each present', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400 }),
        makePlayer({ id: 'P2', x: 200, y: 400 }),
        makePlayer({ id: 'B1', x: 300, y: 400 }),
        makePlayer({ id: 'B2', x: 400, y: 400 }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    const slot0 = OBS_OPPONENT_OFFSET + 0 * PER_OPPONENT_FEATURES;
    expect(out[slot0 + 0]).toBeCloseTo(200 / 1280, 5);
    expect(out[slot0 + 11]).toBe(1);

    const slot1 = OBS_OPPONENT_OFFSET + 1 * PER_OPPONENT_FEATURES;
    expect(out[slot1 + 0]).toBeCloseTo(300 / 1280, 5);
    expect(out[slot1 + 11]).toBe(1);

    const slot2 = OBS_OPPONENT_OFFSET + 2 * PER_OPPONENT_FEATURES;
    expect(out[slot2 + 0]).toBeCloseTo(100 / 1280, 5);
    expect(out[slot2 + 11]).toBe(1);

    const slot3 = OBS_OPPONENT_OFFSET + 3 * PER_OPPONENT_FEATURES;
    for (let f = 0; f < PER_OPPONENT_FEATURES; f++) {
      expect(out[slot3 + f]).toBe(0);
    }
  });

  it('encodes opponent dx/dy relative to self', () => {
    const arena = makeArena({ width: 1280, height: 720 });
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 200, y: 400 }),
        makePlayer({ id: 'P2', x: 600, y: 400 }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    const base = OBS_OPPONENT_OFFSET;
    expect(out[base + 0]).toBeCloseTo(400 / 1280, 5);
    expect(out[base + 1]).toBeCloseTo(0, 5);
    expect(out[base + 11]).toBe(1);
  });

  it('marks an inactive (splat) opponent with alive=0 but present=1', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400 }),
        makePlayer({ id: 'P2', x: 600, y: 400, state: 'splat' }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    const base = OBS_OPPONENT_OFFSET;
    expect(out[base + 10]).toBe(0);
    expect(out[base + 11]).toBe(1);
  });

  it('encodes only active carrots in insertion order; padding is zeroed', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const carrots: Carrot[] = [
      { x: 100, y: 200, active: true,  spawnTime: 0 },
      { x: 300, y: 200, active: false, spawnTime: 1 },
      { x: 500, y: 200, active: true,  spawnTime: 2 },
    ];
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 0, y: 0 })],
      carrots,
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    const c0 = OBS_CARROT_OFFSET + 0 * PER_CARROT_FEATURES;
    expect(out[c0 + 0]).toBeCloseTo(100 / 1280, 5);
    expect(out[c0 + 1]).toBeCloseTo(200 / 720, 5);
    expect(out[c0 + 2]).toBe(1);

    const c1 = OBS_CARROT_OFFSET + 1 * PER_CARROT_FEATURES;
    expect(out[c1 + 0]).toBeCloseTo(500 / 1280, 5);
    expect(out[c1 + 1]).toBeCloseTo(200 / 720, 5);
    expect(out[c1 + 2]).toBe(1);

    for (let i = 2; i < 4; i++) {
      const base = OBS_CARROT_OFFSET + i * PER_CARROT_FEATURES;
      for (let f = 0; f < PER_CARROT_FEATURES; f++) {
        expect(out[base + f]).toBe(0);
      }
    }
  });

  it('encodes hazard zones from arena.hazardZones (relative position + normalized size)', () => {
    const hazardZones: HazardZone[] = [
      { x: 100, y: 600, width: 300, height: 40, type: 'lava' },
    ];
    const arena = makeArena({ width: 1280, height: 720, hazardZones });
    const settings = makeSettings();
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 200, y: 300 })],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    const base = OBS_HAZARD_OFFSET;
    expect(out[base + 0]).toBeCloseTo((100 - 200) / 1280, 5);
    expect(out[base + 1]).toBeCloseTo((600 - 300) / 720, 5);
    expect(out[base + 2]).toBeCloseTo(300 / 1280, 5);
    expect(out[base + 3]).toBeCloseTo(40 / 720, 5);

    for (let i = 1; i < 4; i++) {
      const slot = OBS_HAZARD_OFFSET + i * PER_HAZARD_FEATURES;
      for (let f = 0; f < PER_HAZARD_FEATURES; f++) {
        expect(out[slot + f]).toBe(0);
      }
    }
  });

  it('is deterministic: same state + same slot produce byte-identical observations', () => {
    const hazardZones: HazardZone[] = [
      { x: 0, y: 700, width: 1280, height: 20, type: 'lava' },
    ];
    const arena = makeArena({ hazardZones });
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400, vx: 50, vy: 0 }),
        makePlayer({ id: 'P2', x: 800, y: 200, vx: -100, vy: 200, state: 'airborne' }),
        makePlayer({ id: 'B1', x: 500, y: 500, score: 4 }),
      ],
      carrots: [
        { x: 300, y: 250, active: true, spawnTime: 0 },
        { x: 900, y: 350, active: true, spawnTime: 1 },
      ],
    });

    const out1 = new Float32Array(OBSERVATION_SIZE);
    const out2 = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out1);
    extractObservation(state, 'P1', arena, settings, out2);

    expect(Array.from(out2)).toEqual(Array.from(out1));
  });

  it('wrap-aware: opponent on the wrap-near side encodes the short signed distance', () => {
    const arena = makeArena({ width: 1280, height: 720 });
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 10, y: 400 }),
        makePlayer({ id: 'P2', x: 1270, y: 400 }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    const base = OBS_OPPONENT_OFFSET;
    expect(out[base + 0]).toBeCloseTo(-20 / 1280, 5);
    expect(out[base + 0]).not.toBeCloseTo(1260 / 1280, 2);
  });

  it('wrap-aware: y-axis is unchanged (no vertical wrap)', () => {
    const arena = makeArena({ width: 1280, height: 720 });
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 10, y: 400 }),
        makePlayer({ id: 'P2', x: 1270, y: 200 }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    const base = OBS_OPPONENT_OFFSET;
    expect(out[base + 1]).toBeCloseTo((200 - 400) / 720, 5);
  });

  it('wrap-aware: carrot on the wrap-near side encodes the short signed distance', () => {
    const arena = makeArena({ width: 1280, height: 720 });
    const settings = makeSettings();
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 10, y: 400 })],
      carrots: [{ x: 1270, y: 400, active: true, spawnTime: 0 }],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    const base = OBS_CARROT_OFFSET;
    expect(out[base + 0]).toBeCloseTo(-20 / 1280, 5);
    expect(out[base + 0]).not.toBeCloseTo(1260 / 1280, 2);
    expect(out[base + 1]).toBeCloseTo(0, 5);
    expect(out[base + 2]).toBe(1);
  });

  it('wrap-aware: hazard left edge wraps; width is left as-is', () => {
    const hazardZones: HazardZone[] = [
      { x: 1270, y: 600, width: 40, height: 30, type: 'lava' },
    ];
    const arena = makeArena({ width: 1280, height: 720, hazardZones });
    const settings = makeSettings();
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 10, y: 400 })],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    const base = OBS_HAZARD_OFFSET;
    expect(out[base + 0]).toBeCloseTo(-20 / 1280, 5);
    expect(out[base + 2]).toBeCloseTo(40 / 1280, 5);
    expect(out[base + 3]).toBeCloseTo(30 / 720, 5);
  });

  it('wrap-aware: opponent exactly at half-width is encoded as +0.5', () => {
    const arena = makeArena({ width: 1280, height: 720 });
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 0, y: 400 }),
        makePlayer({ id: 'P2', x: 640, y: 400 }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    const base = OBS_OPPONENT_OFFSET;
    expect(out[base + 0]).toBeCloseTo(0.5, 5);
  });

  it('makeObservation allocates a properly-sized Float32Array and fills it', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 640, y: 360 })],
    });

    const obs = makeObservation(state, 'P1', arena, settings);
    expect(obs).toBeInstanceOf(Float32Array);
    expect(obs.length).toBe(OBSERVATION_SIZE);
    expect(obs[OBS_SELF_OFFSET + 0]).toBeCloseTo(0.5, 5);
    expect(obs[OBS_SELF_OFFSET + 1]).toBeCloseTo(0.5, 5);
    expect(obs[OBS_SELF_OFFSET + 4]).toBe(1);
  });

  // ---------- Match context block ----------

  it('match context: all 7 mods + scoring + limits encode correctly when all-on', () => {
    const arena = makeArena();
    const state = makeState({ players: [makePlayer({ id: 'P1' })], timeElapsed: 60 });
    const settings = makeSettings({
      killLimit: 32,
      timeLimit: 120,
      mods: {
        extremeGore: true, carrotChase: true, giantPlayers: true, turbo: true,
        superBounce: true, mirrorArena: true, underwaterGravity: true,
      },
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    expect(out[OBS_MATCH_CONTEXT_OFFSET + 0]).toBe(1); // carrotChase
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 1]).toBe(1); // mirrorArena
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 2]).toBe(1); // superBounce
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 3]).toBe(1); // turbo
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 4]).toBe(1); // giantPlayers
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 5]).toBe(1); // underwaterGravity
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 6]).toBe(1); // extremeGore
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 7]).toBe(0); // killScoreValue_norm: 0 because carrotChase ON
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 8]).toBeCloseTo(1, 5); // 32 / 32 = 1
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 9]).toBeCloseTo(0.5, 5); // 60 / 120
  });

  it('match context: carrotChase OFF → killScoreValue_norm = 1', () => {
    const arena = makeArena();
    const state = makeState({ players: [makePlayer({ id: 'P1' })] });
    const settings = makeSettings(); // carrotChase: false (default)
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    expect(out[OBS_MATCH_CONTEXT_OFFSET + 0]).toBe(0);
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 7]).toBe(1);
  });

  it('match context: carrotChase ON → killScoreValue_norm = 0', () => {
    const arena = makeArena();
    const state = makeState({ players: [makePlayer({ id: 'P1' })] });
    const settings = makeSettings({
      mods: {
        extremeGore: false, carrotChase: true, giantPlayers: false, turbo: false,
        superBounce: false, mirrorArena: false, underwaterGravity: false,
      },
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);

    expect(out[OBS_MATCH_CONTEXT_OFFSET + 0]).toBe(1);
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 7]).toBe(0);
  });

  // ---------- Self block additions ----------

  it('self burn_norm: burnTimer at half BURN_TIMER_MAX (5s) ≈ 0.5', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const state = makeState({
      players: [makePlayer({ id: 'P1', burnTimer: 2.5 })],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_SELF_OFFSET + 8]).toBeCloseTo(0.5, 5);
  });

  it('self score_norm: score at half killLimit ≈ 0.5', () => {
    const arena = makeArena();
    const settings = makeSettings({ killLimit: 16 });
    const state = makeState({
      players: [makePlayer({ id: 'P1', score: 8 })],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_SELF_OFFSET + 9]).toBeCloseTo(0.5, 5);
  });

  it('self score_norm clamps to 2 in time-limit-only matches with high scores', () => {
    const arena = makeArena();
    const settings = makeSettings({ killLimit: 0, timeLimit: 180 });
    const state = makeState({
      players: [makePlayer({ id: 'P1', score: 999 })],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    // killLimit=0 falls back to SCORE_FALLBACK_DIVISOR=16; 999/16 clamps to cap=2
    expect(out[OBS_SELF_OFFSET + 9]).toBe(2);
  });

  it('opponent score_diff is killLimit-relative and clamped', () => {
    const arena = makeArena();
    // killLimit=8 → leading by 4 reads as +0.5; would have been +0.25 under fixed /16 divisor
    const settings = makeSettings({ killLimit: 8 });
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', score: 0 }),
        makePlayer({ id: 'P2', score: 4 }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_OPPONENT_OFFSET + 5]).toBeCloseTo(0.5, 5);

    // Extreme score gap clamps to ±2
    const big = makeState({
      players: [
        makePlayer({ id: 'P1', score: 0 }),
        makePlayer({ id: 'P2', score: 999 }),
      ],
    });
    extractObservation(big, 'P1', arena, settings, out);
    expect(out[OBS_OPPONENT_OFFSET + 5]).toBe(2);
    extractObservation(big, 'P2', arena, settings, out);
    expect(out[OBS_OPPONENT_OFFSET + 5]).toBe(-2);
  });

  it('self splat flag: state="splat" → out[OBS_SELF_OFFSET + 10] = 1', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const state = makeState({
      players: [makePlayer({ id: 'P1', state: 'splat' })],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_SELF_OFFSET + 10]).toBe(1);
    expect(out[OBS_SELF_OFFSET + 11]).toBe(0);
  });

  it('self respawning flag: state="respawning" → out[OBS_SELF_OFFSET + 11] = 1', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const state = makeState({
      players: [makePlayer({ id: 'P1', state: 'respawning' })],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_SELF_OFFSET + 10]).toBe(0);
    expect(out[OBS_SELF_OFFSET + 11]).toBe(1);
  });

  it('time progress: timeElapsed=60, timeLimit=120 → 0.5', () => {
    const arena = makeArena();
    const settings = makeSettings({ timeLimit: 120 });
    const state = makeState({
      players: [makePlayer({ id: 'P1' })],
      timeElapsed: 60,
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 9]).toBeCloseTo(0.5, 5);
  });

  it('time progress: timeLimit=0 (no limit) → 0', () => {
    const arena = makeArena();
    const settings = makeSettings({ timeLimit: 0 });
    const state = makeState({
      players: [makePlayer({ id: 'P1' })],
      timeElapsed: 9999,
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_MATCH_CONTEXT_OFFSET + 9]).toBe(0);
  });

  // ---------- Opponent block — timer norms ----------

  it('opponent fat_norm: fatTimer normalized by FAT_TIMER_MAX (6.6s) at offset +6', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400 }),
        makePlayer({ id: 'P2', x: 200, y: 400, fatTimer: 3.3 }), // half of 6.6
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_OPPONENT_OFFSET + 6]).toBeCloseTo(0.5, 5);
  });

  it('opponent fat_norm: clamps to 1.0 when fatTimer exceeds FAT_TIMER_MAX', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400 }),
        makePlayer({ id: 'P2', x: 200, y: 400, fatTimer: 999 }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_OPPONENT_OFFSET + 6]).toBe(1);
  });

  it('opponent slow_norm: slowTimer normalized by SLOW_TIMER_MAX (5s) at offset +7', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400 }),
        makePlayer({ id: 'P2', x: 200, y: 400, slowTimer: 2.5 }), // half of 5
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_OPPONENT_OFFSET + 7]).toBeCloseTo(0.5, 5);
  });

  it('opponent invincible_norm: invincibleTimer normalized by INVINCIBLE_TIMER_MAX (1.5s) at offset +8', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400 }),
        makePlayer({ id: 'P2', x: 200, y: 400, invincibleTimer: 0.75 }), // half of 1.5
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_OPPONENT_OFFSET + 8]).toBeCloseTo(0.5, 5);
  });

  it('opponent burn_norm: burnTimer normalized by BURN_TIMER_MAX (5s) at offset +9', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400 }),
        makePlayer({ id: 'P2', x: 200, y: 400, burnTimer: 2.5 }), // half of 5
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_OPPONENT_OFFSET + 9]).toBeCloseTo(0.5, 5);
  });

  it('opponent timer norms are zero when timers are zero (default player)', () => {
    const arena = makeArena();
    const settings = makeSettings();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400 }),
        makePlayer({ id: 'P2', x: 200, y: 400 }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, settings, out);
    expect(out[OBS_OPPONENT_OFFSET + 6]).toBe(0); // fat
    expect(out[OBS_OPPONENT_OFFSET + 7]).toBe(0); // slow
    expect(out[OBS_OPPONENT_OFFSET + 8]).toBe(0); // invincible
    expect(out[OBS_OPPONENT_OFFSET + 9]).toBe(0); // burn
  });
});
