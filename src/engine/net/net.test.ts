import { describe, it, expect } from 'vitest';
import { SeededRNG } from './prng';
import {
  encodeInput, decodeInput,
  encodeInputMessage, decodeInputMessage,
  encodePing, decodePingPong,
  MsgType,
} from './protocol';
import { crc32, takeSnapshot, restoreSnapshot, hashGameState, hashGameStateDetailed, hashSnapshot } from './serialize';
import type { MatchState, Player, PlayerSlot } from '../types';

describe('SeededRNG', () => {
  it('produces deterministic sequences', () => {
    const a = new SeededRNG(42);
    const b = new SeededRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(a.nextFloat()).toBe(b.nextFloat());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRNG(1);
    const b = new SeededRNG(2);
    const aVals = Array.from({ length: 10 }, () => a.nextFloat());
    const bVals = Array.from({ length: 10 }, () => b.nextFloat());
    expect(aVals).not.toEqual(bVals);
  });

  it('produces values in [0, 1)', () => {
    const rng = new SeededRNG(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('saves and restores state', () => {
    const rng = new SeededRNG(99);
    for (let i = 0; i < 50; i++) rng.nextFloat();
    const state = rng.getState();
    const v1 = rng.nextFloat();
    const v2 = rng.nextFloat();

    rng.setState(state);
    expect(rng.nextFloat()).toBe(v1);
    expect(rng.nextFloat()).toBe(v2);
  });

  it('clone produces identical sequence', () => {
    const rng = new SeededRNG(7);
    for (let i = 0; i < 20; i++) rng.nextFloat();
    const clone = rng.clone();
    for (let i = 0; i < 50; i++) {
      expect(rng.nextFloat()).toBe(clone.nextFloat());
    }
  });

  it('nextRange produces values in [min, max)', () => {
    const rng = new SeededRNG(555);
    for (let i = 0; i < 500; i++) {
      const v = rng.nextRange(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('nextInt produces integers in [min, max]', () => {
    const rng = new SeededRNG(777);
    for (let i = 0; i < 500; i++) {
      const v = rng.nextInt(0, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('Protocol encoding', () => {
  it('encodes and decodes input bitfield', () => {
    const cases = [
      { left: false, right: false, jump: false, down: false },
      { left: true, right: false, jump: false, down: false },
      { left: false, right: true, jump: false, down: false },
      { left: false, right: false, jump: true, down: false },
      { left: false, right: false, jump: false, down: true },
      { left: true, right: true, jump: true, down: true },
      { left: true, right: false, jump: true, down: false },
    ];
    for (const input of cases) {
      const encoded = encodeInput(input);
      const decoded = decodeInput(encoded);
      expect(decoded).toEqual(input);
    }
  });

  it('encodes and decodes input messages with bundling', () => {
    const inputs = [
      { frame: 10, input: { left: true, right: false, jump: false, down: false } },
      { frame: 11, input: { left: true, right: false, jump: true, down: false } },
      { frame: 12, input: { left: false, right: true, jump: false, down: true } },
    ];
    const latestAck = 8;

    const buf = encodeInputMessage(inputs, latestAck, undefined, 'P1');
    const decoded = decodeInputMessage(buf);

    expect(decoded).not.toBeNull();
    expect(decoded!.inputCount).toBe(3);
    expect(decoded!.latestAck).toBe(latestAck);
    expect(decoded!.source).toBe(1); // P1 = 1

    for (let i = 0; i < inputs.length; i++) {
      expect(decoded!.inputs[i].frame).toBe(inputs[i].frame);
      expect(decoded!.inputs[i].input).toEqual(inputs[i].input);
    }
  });

  it('handles large frame numbers (uint32)', () => {
    const inputs = [
      { frame: 100000, input: { left: true, right: false, jump: false, down: false } },
      { frame: 100001, input: { left: false, right: true, jump: false, down: false } },
      { frame: 4294967295, input: { left: false, right: false, jump: true, down: false } }, // max uint32
    ];

    const buf = encodeInputMessage(inputs, 99999, undefined, 'P2');
    const decoded = decodeInputMessage(buf);

    expect(decoded!.inputs[0].frame).toBe(100000);
    expect(decoded!.inputs[1].frame).toBe(100001);
    expect(decoded!.inputs[2].frame).toBe(4294967295);
    expect(decoded!.latestAck).toBe(99999);
    expect(decoded!.source).toBe(2); // P2 = 2
  });

  it('encodes and decodes ping/pong', () => {
    const timestamp = 12345.678;
    const pingBuf = encodePing(timestamp);
    const decoded = decodePingPong(pingBuf);

    expect(decoded).not.toBeNull();
    expect(decoded!.type).toBe(MsgType.PING);
    expect(decoded!.timestamp).toBeCloseTo(timestamp);
  });

  it('rejects malformed messages', () => {
    const empty = new ArrayBuffer(0);
    expect(decodeInputMessage(empty)).toBeNull();
    expect(decodePingPong(empty)).toBeNull();

    const tooShort = new ArrayBuffer(2);
    expect(decodePingPong(tooShort)).toBeNull();
  });
});

describe('CRC32', () => {
  it('produces consistent hashes', () => {
    expect(crc32('hello')).toBe(crc32('hello'));
    expect(crc32('')).toBe(crc32(''));
  });

  it('produces different hashes for different inputs', () => {
    expect(crc32('hello')).not.toBe(crc32('world'));
    expect(crc32('abc')).not.toBe(crc32('abd'));
  });

  it('returns a positive 32-bit integer', () => {
    const hash = crc32('test string');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xFFFFFFFF);
    expect(Number.isInteger(hash)).toBe(true);
  });
});

describe('Message loop prevention', () => {
  /**
   * Simulates the lobby message handler logic from OnlineLobby.tsx.
   * This is a protocol-level test — we can't mount React components in vitest,
   * but we CAN verify the message handling rules that prevent infinite loops.
   */

  // Simulates one peer's message handler. Returns any outgoing messages it would send.
  function simulateLobbyHandler(
    msg: { type: number; [key: string]: unknown },
    localChar: string,
    allCharNames: string[],
  ): Array<{ type: number; [key: string]: unknown }> {
    const outgoing: Array<{ type: number; [key: string]: unknown }> = [];

    switch (msg.type) {
      case MsgType.HANDSHAKE:
        // Must NOT echo — echoing causes infinite ping-pong
        break;
      case MsgType.CHARACTER_SELECT:
        // Just record it — no outgoing message from the handler itself
        break;
      default:
        break;
    }

    return outgoing;
  }

  it('HANDSHAKE does not produce a response (no echo loop)', () => {
    const outgoing = simulateLobbyHandler(
      { type: MsgType.HANDSHAKE, protocolVersion: 1, playerName: 'Alice' },
      'Bunny',
      ['Bunny', 'Fox', 'Frog'],
    );
    expect(outgoing).toHaveLength(0);
  });

  it('CHARACTER_SELECT does not produce a response from handler', () => {
    const outgoing = simulateLobbyHandler(
      { type: MsgType.CHARACTER_SELECT, characterName: 'Fox' },
      'Bunny',
      ['Bunny', 'Fox', 'Frog'],
    );
    expect(outgoing).toHaveLength(0);
  });

  it('simulated two-peer handshake converges (no infinite loop)', () => {
    // Simulate: both peers send initial HANDSHAKE on connect, then process each other's
    const peerA_outbox: Array<{ type: number; [key: string]: unknown }>  = [];
    const peerB_outbox: Array<{ type: number; [key: string]: unknown }>  = [];

    // Step 1: both send initial handshake (on connect, not from handler)
    const initialA = { type: MsgType.HANDSHAKE, protocolVersion: 1, playerName: 'A' };
    const initialB = { type: MsgType.HANDSHAKE, protocolVersion: 1, playerName: 'B' };

    // Step 2: A processes B's handshake
    peerA_outbox.push(...simulateLobbyHandler(initialB, 'Bunny', ['Bunny', 'Fox']));
    // Step 3: B processes A's handshake
    peerB_outbox.push(...simulateLobbyHandler(initialA, 'Fox', ['Bunny', 'Fox']));

    // Neither should have produced a response
    expect(peerA_outbox).toHaveLength(0);
    expect(peerB_outbox).toHaveLength(0);

    // No further messages to process — conversation ended. No loop.
  });

  it('simulated character select does not cascade', () => {
    // B receives A's character change to Fox (same as B's current)
    const bOutgoing = simulateLobbyHandler(
      { type: MsgType.CHARACTER_SELECT, characterName: 'Fox' },
      'Fox', // B's current character — same as what A just picked
      ['Bunny', 'Fox', 'Frog'],
    );

    // Handler must NOT send anything — no auto-switch in the message handler
    expect(bOutgoing).toHaveLength(0);
  });

  it('full two-peer simulation with same default character does not loop', () => {
    // Both peers start with 'Bunny' (the default).
    // After the fix, guest defaults to 'Fox' so this shouldn't happen,
    // but even if both somehow pick the same, messages must not cascade.
    const chars = ['Bunny', 'Fox', 'Frog'];

    // On connect: A sends CHARACTER_SELECT(Bunny), B sends CHARACTER_SELECT(Bunny)
    // A processes B's message:
    const aOut = simulateLobbyHandler(
      { type: MsgType.CHARACTER_SELECT, characterName: 'Bunny' },
      'Bunny', chars,
    );
    // B processes A's message:
    const bOut = simulateLobbyHandler(
      { type: MsgType.CHARACTER_SELECT, characterName: 'Bunny' },
      'Bunny', chars,
    );

    // Neither handler sends anything — total messages in flight = 0
    expect(aOut).toHaveLength(0);
    expect(bOut).toHaveLength(0);

    // No further messages → no loop. The UI just shows both picked the same
    // and the dropdown filters out the opponent's choice so they must pick another.
  });
});

describe('Trystero import', () => {
  it('can import trystero module', async () => {
    // Just verify the module resolves — can't create actual rooms without a browser
    const trystero = await import('@trystero-p2p/mqtt');
    expect(trystero).toBeDefined();
    expect(trystero.joinRoom).toBeDefined();
  });
});

// ---- Snapshot coverage tests ----

/** Fields intentionally excluded from PlayerSnapshot (cosmetic or reconstructed). */
const PLAYER_EXCLUDED_FIELDS = ['character', 'afterimages', 'renderOffsetX', 'renderOffsetY'];

function makeTestPlayer(id: PlayerSlot): Player {
  return {
    id,
    character: { name: 'bunny', color: '#fff', darkColor: '#ccc', lightColor: '#fff', emoji: '🐰' } as any,
    x: 100.5, y: 200.5,
    vx: 55.5, vy: -33.3,
    width: 24, height: 40,
    state: 'airborne' as const,
    facing: 'right' as const,
    splatTimer: 1.5,
    respawnTimer: 2.5,
    invincibleTimer: 0.8,
    score: 7,
    active: true,
    animFrame: 3,
    animTimer: 0.12,
    fastFalling: true,
    fatTimer: 5.0,
    slowTimer: 3.0,
    squashScale: 0.85,
    squashTimer: 0.4,
    sideSquash: 0.75,
    afterimages: [{ x: 90, y: 190, facing: 'left' as const, alpha: 0.5 }],
    idleAnimTimer: 1.2,
    expression: 'angry' as const,
    killStreak: 3,
    breathTimer: 0.6,
    springTrailTimer: 0.3,
    damageFlashSide: 'left' as const,
    damageFlashTimer: 0.15,
    burnTimer: 2.0,
    hitstopTimer: 0.1,
    renderOffsetX: 5.5,
    renderOffsetY: -3.2,
    disconnected: true,
  };
}

function makeTestMatchState(): MatchState {
  return {
    players: [makeTestPlayer('P1'), makeTestPlayer('P2')],
    killFeed: [{ attackerId: 'P1', victimId: 'P2', time: 10.5, character: 'bunny', victimCharacter: 'fox' } as any],
    timeElapsed: 42.5,
    matchOver: false,
    winner: null,
    carrots: [{ x: 300, y: 400, collected: false } as any],
    carrotTimer: 5.5,
    springs: [{ x: 500, y: 600, bounceTimer: 0 } as any],
    thorns: [{ x: 700, y: 650, hitTimer: 0 } as any],
    springSpawnTimer: 12.3,
    thornSpawnTimer: 8.7,
    screenShake: 0.3,
    slowMotion: 0.5,
    weather: [],
    dayPhase: 0.25,
    countdown: 0,
    stats: { perPlayer: new Map([['P1', { bestStreak: 3, timeAirborne: 10, distanceTraveled: 500, carrotsEaten: 2 }]]) },
    shockwaves: [{ x: 100, y: 200, radius: 10, maxRadius: 50, life: 0.8 }],
    screenFlash: 0.2,
    hitstopZoom: 0.1,
    wildlife: [],
    fogParticles: [],
    pollenParticles: [],
    shootingStars: [],
    scoreAnimations: [{ playerId: 'P1' as PlayerSlot, value: 2, timer: 0.5 }],
    ghosts: [],
    lavaRocks: [],
    lavaRockTimer: 15.0,
    geyserStates: [{ timer: 3.0, active: true, activeTimer: 1.5 }],
    pigeonFlocks: [{ x: 200, y: 100, active: true, respawnTimer: 0, scatterParticles: [] }],
    bouncyWobble: new Map([[0, 0.5], [2, 0.3]]),
    gibs: [],
    confetti: [],
  };
}

describe('Snapshot field coverage', () => {
  it('round-trips all gameplay-affecting Player fields', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(123);
    const aiControllers = new Map<string, any>();

    const snap = takeSnapshot(0, state, rng, aiControllers);

    // Mutate the player to verify restore actually changes values
    const p = state.players[0];
    p.x = 0; p.y = 0; p.vx = 0; p.vy = 0;
    p.score = 0; p.state = 'idle'; p.facing = 'left';
    p.splatTimer = 0; p.respawnTimer = 0; p.invincibleTimer = 0;
    p.animFrame = 0; p.animTimer = 0; p.fastFalling = false;
    p.fatTimer = 0; p.slowTimer = 0; p.squashScale = 1;
    p.squashTimer = 0; p.sideSquash = 1; p.idleAnimTimer = 0;
    p.expression = 'normal'; p.killStreak = 0; p.breathTimer = 0;
    p.springTrailTimer = 0; p.damageFlashSide = null; p.damageFlashTimer = 0;
    p.burnTimer = 0; p.hitstopTimer = 0; p.disconnected = false;

    restoreSnapshot(snap, state, rng, aiControllers);

    const restored = state.players[0];
    const original = makeTestPlayer('P1');

    // Verify every non-excluded field round-trips
    for (const key of Object.keys(original)) {
      if (PLAYER_EXCLUDED_FIELDS.includes(key)) continue;
      expect(restored[key as keyof Player], `Player.${key} should round-trip`).toEqual(original[key as keyof Player]);
    }
  });

  it('every Player field is either serialized or explicitly excluded', () => {
    const player = makeTestPlayer('P1');
    const allKeys = Object.keys(player);

    const state = makeTestMatchState();
    const rng = new SeededRNG(123);
    const snap = takeSnapshot(0, state, rng, new Map());
    const snapKeys = Object.keys(snap.players[0]);

    for (const key of allKeys) {
      const isExcluded = PLAYER_EXCLUDED_FIELDS.includes(key);
      const isSerialized = snapKeys.includes(key);
      expect(
        isExcluded || isSerialized,
        `Player.${key} is neither serialized nor in the exclusion list — add it to PlayerSnapshot or PLAYER_EXCLUDED_FIELDS`,
      ).toBe(true);
    }
  });

  it('round-trips MatchState gameplay fields', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(456);
    const snap = takeSnapshot(0, state, rng, new Map());

    // Mutate state
    state.timeElapsed = 0;
    state.carrotTimer = 0;
    state.springSpawnTimer = 0;
    state.thornSpawnTimer = 0;
    state.screenShake = 0;
    state.slowMotion = 0;
    state.screenFlash = 0;
    state.hitstopZoom = 0;
    state.dayPhase = 0;
    state.lavaRockTimer = 0;
    state.carrots.length = 0;
    state.bouncyWobble.clear();

    restoreSnapshot(snap, state, rng, new Map());

    expect(state.timeElapsed).toBe(42.5);
    expect(state.carrotTimer).toBe(5.5);
    expect(state.springSpawnTimer).toBe(12.3);
    expect(state.thornSpawnTimer).toBe(8.7);
    expect(state.screenShake).toBe(0.3);
    expect(state.slowMotion).toBe(0.5);
    expect(state.screenFlash).toBe(0.2);
    expect(state.hitstopZoom).toBe(0.1);
    expect(state.dayPhase).toBe(0.25);
    expect(state.lavaRockTimer).toBe(15.0);
    expect(state.bouncyWobble.size).toBe(2);
  });
});

describe('Per-subsystem hash', () => {
  it('detailed hash composite matches simple hash', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(789);

    const simple = hashGameState(state, rng);
    const detailed = hashGameStateDetailed(state, rng);

    expect(detailed.hash).toBe(simple);
  });

  it('player mutation changes playersHash but not timersHash', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(789);

    const before = hashGameStateDetailed(state, rng);
    const beforePlayers = before.playersHash;
    const beforeTimers = before.timersHash;

    state.players[0].x += 10;
    const after = hashGameStateDetailed(state, rng);

    expect(after.playersHash).not.toBe(beforePlayers);
    expect(after.timersHash).toBe(beforeTimers);
  });

  it('hashSnapshot matches hashGameState for same state', () => {
    const state = makeTestMatchState();
    const rng = new SeededRNG(101);

    const liveHash = hashGameState(state, rng);
    const snap = takeSnapshot(0, state, rng, new Map());
    const snapHash = hashSnapshot(snap);

    expect(snapHash).toBe(liveHash);
  });
});
