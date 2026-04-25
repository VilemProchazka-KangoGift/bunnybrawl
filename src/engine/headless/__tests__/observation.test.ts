// @vitest-environment node
//
// Observation extractor (Task 4.2).
// Pure Node — no browser/audio/renderer imports. Verifies layout, ordering,
// determinism, and edge cases (missing slot, oversized buffer, etc.).

import { describe, it, expect } from 'vitest';
import {
  extractObservation,
  makeObservation,
  OBSERVATION_SIZE,
  OBS_OPPONENT_OFFSET,
  OBS_CARROT_OFFSET,
  OBS_HAZARD_OFFSET,
  PER_OPPONENT_FEATURES,
  PER_CARROT_FEATURES,
  PER_HAZARD_FEATURES,
} from '../observation';
import { makePlayer, makeState, makeArena } from '../../__tests__/testHelpers';
import type { Carrot, HazardZone } from '../../types';

describe('observation extractor (Task 4.2 — pure Node)', () => {
  it('throws when the output buffer is too small', () => {
    const state = makeState({ players: [makePlayer({ id: 'P1' })] });
    const arena = makeArena();
    const tooSmall = new Float32Array(OBSERVATION_SIZE - 1);
    expect(() => extractObservation(state, 'P1', arena, tooSmall)).toThrow(/too small/i);
  });

  it('returns all zeros when the requested slot is not in the state', () => {
    const state = makeState({ players: [makePlayer({ id: 'P2' })] });
    const arena = makeArena();
    const out = new Float32Array(OBSERVATION_SIZE);
    // Pre-fill with a sentinel value so we can confirm the zeroing happens.
    out.fill(7);
    extractObservation(state, 'P1', arena, out);
    for (let i = 0; i < OBSERVATION_SIZE; i++) {
      expect(out[i]).toBe(0);
    }
  });

  it('encodes the self block: position, velocity, on_ground for idle vs airborne', () => {
    // Idle player at arena center
    const arena = makeArena({ width: 1280, height: 720 });
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 640, y: 360, vx: 300, vy: -300, state: 'idle' }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, out);

    expect(out[0]).toBeCloseTo(0.5, 5);  // x_norm = 640/1280
    expect(out[1]).toBeCloseTo(0.5, 5);  // y_norm = 360/720
    expect(out[2]).toBeCloseTo(0.5, 5);  // vx_norm = 300/600
    expect(out[3]).toBeCloseTo(-0.5, 5); // vy_norm = -300/600
    expect(out[4]).toBe(1);              // on_ground

    // Same player, but airborne
    const state2 = makeState({
      players: [
        makePlayer({ id: 'P1', x: 640, y: 360, vx: 0, vy: 0, state: 'airborne' }),
      ],
    });
    const out2 = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state2, 'P1', arena, out2);
    expect(out2[4]).toBe(0); // on_ground = 0 when airborne
  });

  it('orders opponents by slot id alphabetically and marks each present', () => {
    // Players: P1 (self), P2, B1, B2. Alphabetical opponents from P1's view:
    //   B1 < B2 < P2.
    const arena = makeArena();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400 }),
        makePlayer({ id: 'P2', x: 200, y: 400 }),
        makePlayer({ id: 'B1', x: 300, y: 400 }),
        makePlayer({ id: 'B2', x: 400, y: 400 }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, out);

    // Slot 0 should be B1 (dx = 300-100 = 200; W = 1280)
    const slot0 = OBS_OPPONENT_OFFSET + 0 * PER_OPPONENT_FEATURES;
    expect(out[slot0 + 0]).toBeCloseTo(200 / 1280, 5);
    expect(out[slot0 + 7]).toBe(1); // present

    // Slot 1 should be B2 (dx = 400-100 = 300)
    const slot1 = OBS_OPPONENT_OFFSET + 1 * PER_OPPONENT_FEATURES;
    expect(out[slot1 + 0]).toBeCloseTo(300 / 1280, 5);
    expect(out[slot1 + 7]).toBe(1);

    // Slot 2 should be P2 (dx = 200-100 = 100)
    const slot2 = OBS_OPPONENT_OFFSET + 2 * PER_OPPONENT_FEATURES;
    expect(out[slot2 + 0]).toBeCloseTo(100 / 1280, 5);
    expect(out[slot2 + 7]).toBe(1);

    // Slot 3 (no 4th opponent) should be all zero
    const slot3 = OBS_OPPONENT_OFFSET + 3 * PER_OPPONENT_FEATURES;
    for (let f = 0; f < PER_OPPONENT_FEATURES; f++) {
      expect(out[slot3 + f]).toBe(0);
    }
  });

  it('encodes opponent dx/dy relative to self', () => {
    const arena = makeArena({ width: 1280, height: 720 });
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 200, y: 400 }),
        makePlayer({ id: 'P2', x: 600, y: 400 }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, out);

    // P2 is the only opponent → slot 0
    const base = OBS_OPPONENT_OFFSET;
    expect(out[base + 0]).toBeCloseTo(400 / 1280, 5); // dx_norm = (600-200)/1280
    expect(out[base + 1]).toBeCloseTo(0, 5);          // dy_norm = 0
    expect(out[base + 7]).toBe(1);                    // present
  });

  it('marks an inactive (splat) opponent with alive=0 but present=1', () => {
    const arena = makeArena();
    const state = makeState({
      players: [
        makePlayer({ id: 'P1', x: 100, y: 400 }),
        makePlayer({ id: 'P2', x: 600, y: 400, state: 'splat' }),
      ],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, out);

    const base = OBS_OPPONENT_OFFSET; // P2 = slot 0
    expect(out[base + 6]).toBe(0); // alive = 0 because state === 'splat'
    expect(out[base + 7]).toBe(1); // present = 1 (entry exists)
  });

  it('encodes only active carrots in insertion order; padding is zeroed', () => {
    const arena = makeArena();
    const carrots: Carrot[] = [
      { x: 100, y: 200, active: true,  spawnTime: 0 },
      { x: 300, y: 200, active: false, spawnTime: 1 }, // skipped
      { x: 500, y: 200, active: true,  spawnTime: 2 },
    ];
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 0, y: 0 })],
      carrots,
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, out);

    // Slot 0: first active carrot (x=100, y=200)
    const c0 = OBS_CARROT_OFFSET + 0 * PER_CARROT_FEATURES;
    expect(out[c0 + 0]).toBeCloseTo(100 / 1280, 5);
    expect(out[c0 + 1]).toBeCloseTo(200 / 720, 5);
    expect(out[c0 + 2]).toBe(1); // present

    // Slot 1: second active carrot (x=500, y=200) — the inactive one was skipped
    const c1 = OBS_CARROT_OFFSET + 1 * PER_CARROT_FEATURES;
    expect(out[c1 + 0]).toBeCloseTo(500 / 1280, 5);
    expect(out[c1 + 1]).toBeCloseTo(200 / 720, 5);
    expect(out[c1 + 2]).toBe(1);

    // Slot 2 + 3: no active carrots → zero
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
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 200, y: 300 })],
    });
    const out = new Float32Array(OBSERVATION_SIZE);
    extractObservation(state, 'P1', arena, out);

    const base = OBS_HAZARD_OFFSET;
    expect(out[base + 0]).toBeCloseTo((100 - 200) / 1280, 5); // dx_norm_left
    expect(out[base + 1]).toBeCloseTo((600 - 300) / 720, 5);  // dy_norm_top
    expect(out[base + 2]).toBeCloseTo(300 / 1280, 5);         // w_norm
    expect(out[base + 3]).toBeCloseTo(40 / 720, 5);           // h_norm

    // Remaining hazard slots should be zeroed
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
    extractObservation(state, 'P1', arena, out1);
    extractObservation(state, 'P1', arena, out2);

    expect(Array.from(out2)).toEqual(Array.from(out1));
  });

  it('makeObservation allocates a properly-sized Float32Array and fills it', () => {
    const arena = makeArena();
    const state = makeState({
      players: [makePlayer({ id: 'P1', x: 640, y: 360 })],
    });

    const obs = makeObservation(state, 'P1', arena);
    expect(obs).toBeInstanceOf(Float32Array);
    expect(obs.length).toBe(OBSERVATION_SIZE);

    // Self block populated (x_norm should be 0.5)
    expect(obs[0]).toBeCloseTo(0.5, 5);
    expect(obs[1]).toBeCloseTo(0.5, 5);
    expect(obs[4]).toBe(1); // on_ground (default state is 'idle')
  });
});
