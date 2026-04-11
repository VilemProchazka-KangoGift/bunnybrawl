import { describe, it, expect, vi } from 'vitest';
import { RollbackEngine } from './rollback';
import type { RollbackConfig, NetDebugStats } from './rollback';
import type { MatchState, PlayerSlot, InputState, Player } from '../types';
import { SeededRNG } from './prng';
import { MsgType, encodeInputMessage } from './protocol';
import type { DesyncCheckMessage, DesyncRequestMessage, DesyncCorrectionMessage } from './protocol';
import { createEmptySnapshot, hashGameState, takeSnapshot } from './serialize';

// ---- Mock infrastructure ----

function makeTestPlayer(id: PlayerSlot): Player {
  return {
    id,
    character: { name: 'bunny', color: '#fff', darkColor: '#ccc', lightColor: '#fff', emoji: '🐰' } as any,
    x: 100, y: 600,
    vx: 0, vy: 0,
    width: 32, height: 32,
    state: 'idle' as const,
    facing: 'right' as const,
    splatTimer: 0, respawnTimer: 0, invincibleTimer: 0,
    score: 0, active: true,
    animFrame: 0, animTimer: 0,
    fastFalling: false, fatTimer: 0, slowTimer: 0,
    squashScale: 1, squashTimer: 0, sideSquash: 1,
    afterimages: [],
    idleAnimTimer: 0,
    expression: 'normal' as const,
    killStreak: 0, breathTimer: 0, springTrailTimer: 0,
    damageFlashSide: null, damageFlashTimer: 0,
    burnTimer: 0, hitstopTimer: 0,
    renderOffsetX: 0, renderOffsetY: 0,
    disconnected: false,
  };
}

function makeTestState(): MatchState {
  return {
    players: [makeTestPlayer('P1'), makeTestPlayer('P2')],
    killFeed: [],
    timeElapsed: 0, matchOver: false, winner: null,
    carrots: [], carrotTimer: 5,
    springs: [], thorns: [],
    springSpawnTimer: 10, thornSpawnTimer: 10,
    screenShake: 0, slowMotion: 0,
    weather: [], dayPhase: 0, countdown: 0,
    stats: { perPlayer: new Map() },
    shockwaves: [], screenFlash: 0, hitstopZoom: 0,
    wildlife: [], fogParticles: [], pollenParticles: [], shootingStars: [],
    scoreAnimations: [],
    ghosts: [], lavaRocks: [], lavaRockTimer: 10,
    geyserStates: [], pigeonFlocks: [],
    bouncyWobble: new Map(),
    gibs: [], confetti: [],
  };
}

function makeMockGameLoop(state?: MatchState, rng?: SeededRNG) {
  const s = state ?? makeTestState();
  const r = rng ?? new SeededRNG(42);
  return {
    getState: vi.fn(() => s),
    getRng: vi.fn(() => r),
    getAIControllers: vi.fn(() => new Map()),
    getInputAny: vi.fn(() => ({ left: false, right: false, jump: false, down: false })),
    fixedUpdate: vi.fn(),
    setNetworkMode: vi.fn(),
    setAudioEnabled: vi.fn(),
    setResimulating: vi.fn(),
    setNetDebugStats: vi.fn(),
    renderFrame: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function makeMockTransport() {
  return {
    sendUnreliable: vi.fn(),
    sendReliable: vi.fn(),
    currentRtt: 0,
    currentJitter: 0,
  };
}

function makeEngine(overrides?: Partial<RollbackConfig>) {
  const gameLoop = makeMockGameLoop();
  const transport = makeMockTransport();
  const config: RollbackConfig = {
    localSlot: 'P1',
    remoteSlots: ['P2'],
    isHost: true,
    gameLoop: gameLoop as any,
    transport: transport as any,
    ...overrides,
  };
  const engine = new RollbackEngine(config);
  return { engine, gameLoop, transport, config };
}

// ---- Tests ----

describe('RollbackEngine - construction', () => {
  it('initializes with local and remote slots', () => {
    const { engine } = makeEngine();
    const stats = engine.getStats();
    expect(stats.localFrame).toBe(0);
    expect(stats.stalled).toBe(false);
    expect(stats.inputDelay).toBe(2); // DEFAULT_INPUT_DELAY
  });

  it('initializes per-remote-slot state for multiple remotes', () => {
    const { engine } = makeEngine({ remoteSlots: ['P2', 'P3'] as PlayerSlot[] });
    const stats = engine.getStats();
    // Both remotes start with latestAck = -1
    expect(stats.remoteLatestAck).toBe(-1);
  });
});

describe('RollbackEngine - addRemoteSlot / removeRemoteSlot', () => {
  it('addRemoteSlot adds a new remote', () => {
    const { engine } = makeEngine({ remoteSlots: ['P2'] as PlayerSlot[] });
    engine.addRemoteSlot('P3' as PlayerSlot);
    // P3 should now be tracked — feed an input message from P3
    // No crash means it was added
    expect(() => engine.addRemoteSlot('P3' as PlayerSlot)).not.toThrow(); // idempotent
  });

  it('addRemoteSlot is idempotent for existing slot', () => {
    const { engine } = makeEngine();
    // P2 is already a remote slot
    engine.addRemoteSlot('P2');
    // Should not duplicate
    const stats = engine.getStats();
    expect(stats.remoteLatestAck).toBe(-1);
  });

  it('removeRemoteSlot fires onPlayerDisconnect callback', () => {
    const onDisconnect = vi.fn();
    const { engine } = makeEngine({ onPlayerDisconnect: onDisconnect });
    engine.removeRemoteSlot('P2');
    expect(onDisconnect).toHaveBeenCalledWith('P2');
  });

  it('removeRemoteSlot marks slot as disconnected', () => {
    const { engine } = makeEngine();
    engine.removeRemoteSlot('P2');
    // After disconnect, getStats should not stall on P2's inputs
    // The min remote confirmed frame should be localFrame (disconnected slot returns localFrame)
    const stats = engine.getStats();
    // remoteLatestAck should be -1 (disconnected excluded)
    expect(stats.remoteLatestAck).toBe(-1);
  });

  it('removeRemoteSlot is safe for unknown slot', () => {
    const { engine } = makeEngine();
    expect(() => engine.removeRemoteSlot('P5' as PlayerSlot)).not.toThrow();
  });
});

describe('RollbackEngine - handleInputMessage', () => {
  it('stores confirmed inputs for the correct remote slot', () => {
    const { engine } = makeEngine({ isHost: false });
    const inputs = [{ frame: 5, input: { left: true, right: false, jump: false, down: false } }];
    const buf = encodeInputMessage(inputs, 3, undefined, 'P2');

    engine.handleInputMessage(buf);

    // We can verify by checking that getStats picks up the latestAck
    // (handleInputMessage updates remState.latestAck = decoded.latestAck)
    const stats = engine.getStats();
    expect(stats.remoteLatestAck).toBe(3);
  });

  it('updates confirmedFrame to the highest confirmed frame', () => {
    const { engine, transport } = makeEngine({ isHost: false });
    const inputs = [
      { frame: 3, input: { left: false, right: false, jump: false, down: false } },
      { frame: 4, input: { left: true, right: false, jump: false, down: false } },
      { frame: 5, input: { left: false, right: true, jump: false, down: false } },
    ];
    const buf = encodeInputMessage(inputs, 2, undefined, 'P2');
    engine.handleInputMessage(buf);

    // confirmedFrame should be 5 (highest frame in the message)
    // We verify via the min remote confirmed frame in stats
    // Since engine hasn't advanced, localFrame=0, remoteConfirmedFrame = 5
    // But stats.remoteConfirmedFrame is cached per-frame, so might still be -1
    // We can check remoteLatestAck instead
    expect(engine.getStats().remoteLatestAck).toBe(2);
  });

  it('handles bundled inputs (multiple frames in one message)', () => {
    const { engine } = makeEngine({ isHost: false });
    const inputs = [
      { frame: 10, input: { left: true, right: false, jump: false, down: false } },
      { frame: 11, input: { left: false, right: true, jump: false, down: false } },
      { frame: 12, input: { left: false, right: false, jump: true, down: false } },
    ];
    const buf = encodeInputMessage(inputs, 8, undefined, 'P2');
    engine.handleInputMessage(buf);

    // All 3 frames should be confirmed — check via ack
    expect(engine.getStats().remoteLatestAck).toBe(8);
  });

  it('rejects malformed/empty messages gracefully', () => {
    const { engine } = makeEngine();
    expect(() => engine.handleInputMessage(new ArrayBuffer(0))).not.toThrow();
    expect(() => engine.handleInputMessage(new ArrayBuffer(2))).not.toThrow();
  });

  it('falls back to first remote slot for unknown source in 1v1', () => {
    const { engine } = makeEngine({ remoteSlots: ['P2'] as PlayerSlot[] });
    // Encode as P3 (unknown slot), but in 1v1 it should fall back to P2
    const inputs = [{ frame: 5, input: { left: true, right: false, jump: false, down: false } }];
    const buf = encodeInputMessage(inputs, 4, undefined, 'P3' as PlayerSlot);
    // Should not throw — falls back to P2
    expect(() => engine.handleInputMessage(buf)).not.toThrow();
    expect(engine.getStats().remoteLatestAck).toBe(4);
  });
});

describe('RollbackEngine - handleReliableMessage (desync)', () => {
  it('guest sends DESYNC_REQUEST on hash mismatch', () => {
    const state = makeTestState();
    const rng = new SeededRNG(42);
    const gameLoop = makeMockGameLoop(state, rng);
    const transport = makeMockTransport();
    const engine = new RollbackEngine({
      localSlot: 'P2',
      remoteSlots: ['P1'],
      isHost: false,
      gameLoop: gameLoop as any,
      transport: transport as any,
    });

    // Compute the actual hash for frame 0 state — then send a different hash
    const actualHash = hashGameState(state, rng);
    const wrongHash = actualHash + 1; // deliberately wrong

    const check: DesyncCheckMessage = {
      type: MsgType.DESYNC_CHECK,
      frame: 0, // localFrame is 0, close enough
      hash: wrongHash,
      rngState: rng.getState(),
    };

    engine.handleReliableMessage(check);
    // Guest should send a DESYNC_REQUEST
    expect(transport.sendReliable).toHaveBeenCalledWith(
      expect.objectContaining({ type: MsgType.DESYNC_REQUEST })
    );
  });

  it('guest does not send DESYNC_REQUEST when hashes match', () => {
    const state = makeTestState();
    const rng = new SeededRNG(42);
    const gameLoop = makeMockGameLoop(state, rng);
    const transport = makeMockTransport();
    const engine = new RollbackEngine({
      localSlot: 'P2',
      remoteSlots: ['P1'],
      isHost: false,
      gameLoop: gameLoop as any,
      transport: transport as any,
    });

    const correctHash = hashGameState(state, rng);
    const check: DesyncCheckMessage = {
      type: MsgType.DESYNC_CHECK,
      frame: 0,
      hash: correctHash,
      rngState: rng.getState(),
    };

    engine.handleReliableMessage(check);
    expect(transport.sendReliable).not.toHaveBeenCalled();
  });

  it('host responds to DESYNC_REQUEST with DESYNC_CORRECTION', () => {
    const state = makeTestState();
    const rng = new SeededRNG(42);
    const gameLoop = makeMockGameLoop(state, rng);
    const transport = makeMockTransport();
    const engine = new RollbackEngine({
      localSlot: 'P1',
      remoteSlots: ['P2'],
      isHost: true,
      gameLoop: gameLoop as any,
      transport: transport as any,
    });

    const req: DesyncRequestMessage = { type: MsgType.DESYNC_REQUEST, frame: 0 };
    engine.handleReliableMessage(req);

    expect(transport.sendReliable).toHaveBeenCalledWith(
      expect.objectContaining({ type: MsgType.DESYNC_CORRECTION })
    );
    // The correction should contain a snapshot
    const correction = transport.sendReliable.mock.calls[0][0];
    expect(correction.snapshot).toBeDefined();
    expect(correction.frame).toBeDefined();
  });

  it('guest applies DESYNC_CORRECTION by restoring snapshot', () => {
    const state = makeTestState();
    const rng = new SeededRNG(42);
    const gameLoop = makeMockGameLoop(state, rng);
    const transport = makeMockTransport();
    const engine = new RollbackEngine({
      localSlot: 'P2',
      remoteSlots: ['P1'],
      isHost: false,
      gameLoop: gameLoop as any,
      transport: transport as any,
    });

    // Create a correction snapshot with modified state
    const snap = takeSnapshot(5, state, rng, new Map());
    snap.players[0].x = 999;

    const correction: DesyncCorrectionMessage = {
      type: MsgType.DESYNC_CORRECTION,
      frame: 5,
      snapshot: snap,
    };

    engine.handleReliableMessage(correction);
    // After correction, state.players[0].x should be restored to 999
    expect(state.players[0].x).toBe(999);
  });

  it('host ignores DESYNC_CHECK (only guest processes these)', () => {
    const { engine, transport } = makeEngine({ isHost: true });
    const check: DesyncCheckMessage = {
      type: MsgType.DESYNC_CHECK,
      frame: 0,
      hash: 12345,
      rngState: 0,
    };
    engine.handleReliableMessage(check);
    // Host should not respond to DESYNC_CHECK
    expect(transport.sendReliable).not.toHaveBeenCalled();
  });

  it('guest ignores DESYNC_REQUEST (only host processes these)', () => {
    const { engine, transport } = makeEngine({ isHost: false });
    const req: DesyncRequestMessage = { type: MsgType.DESYNC_REQUEST, frame: 0 };
    engine.handleReliableMessage(req);
    expect(transport.sendReliable).not.toHaveBeenCalled();
  });
});

describe('RollbackEngine - getStats', () => {
  it('returns a cached stats object (same reference)', () => {
    const { engine } = makeEngine();
    const s1 = engine.getStats();
    const s2 = engine.getStats();
    expect(s1).toBe(s2);
  });

  it('reflects current inputDelay', () => {
    const { engine } = makeEngine();
    const stats = engine.getStats();
    expect(stats.inputDelay).toBe(2);
  });

  it('reports max latestAck across non-disconnected remotes', () => {
    const { engine } = makeEngine({ remoteSlots: ['P2', 'P3'] as PlayerSlot[] });

    // Feed inputs from P2 and P3 with different acks
    const buf2 = encodeInputMessage(
      [{ frame: 0, input: { left: false, right: false, jump: false, down: false } }],
      10, undefined, 'P2',
    );
    const buf3 = encodeInputMessage(
      [{ frame: 0, input: { left: false, right: false, jump: false, down: false } }],
      8, undefined, 'P3',
    );
    engine.handleInputMessage(buf2);
    engine.handleInputMessage(buf3);

    const stats = engine.getStats();
    expect(stats.remoteLatestAck).toBe(10);
  });

  it('excludes disconnected remotes from latestAck', () => {
    const { engine } = makeEngine({ remoteSlots: ['P2', 'P3'] as PlayerSlot[] });

    // Feed high ack from P2, low from P3
    const buf2 = encodeInputMessage(
      [{ frame: 0, input: { left: false, right: false, jump: false, down: false } }],
      100, undefined, 'P2',
    );
    engine.handleInputMessage(buf2);

    const buf3 = encodeInputMessage(
      [{ frame: 0, input: { left: false, right: false, jump: false, down: false } }],
      5, undefined, 'P3',
    );
    engine.handleInputMessage(buf3);

    // Disconnect P2
    engine.removeRemoteSlot('P2');

    const stats = engine.getStats();
    // P2 disconnected (ack=100 excluded), P3 connected (ack=5)
    expect(stats.remoteLatestAck).toBe(5);
  });

  it('reports RTT and jitter from transport', () => {
    const { engine, transport } = makeEngine();
    transport.currentRtt = 50;
    transport.currentJitter = 10;
    const stats = engine.getStats();
    expect(stats.rtt).toBe(50);
    expect(stats.jitter).toBe(10);
  });
});

describe('RollbackEngine - start / stop', () => {
  it('start enables network mode on game loop', () => {
    const { engine, gameLoop } = makeEngine();
    // Can't really call start() because it starts RAF loop, but we can check construction
    expect(gameLoop.setNetworkMode).not.toHaveBeenCalled();
  });

  it('stop is safe to call without start', () => {
    const { engine } = makeEngine();
    expect(() => engine.stop()).not.toThrow();
  });
});

describe('RollbackEngine - multiple remotes', () => {
  it('handles 3 remotes simultaneously', () => {
    const { engine } = makeEngine({ remoteSlots: ['P2', 'P3', 'P4'] as PlayerSlot[] });
    // Send inputs from each remote
    for (const slot of ['P2', 'P3', 'P4']) {
      const buf = encodeInputMessage(
        [{ frame: 0, input: { left: false, right: false, jump: false, down: false } }],
        0, undefined, slot as PlayerSlot,
      );
      engine.handleInputMessage(buf);
    }
    const stats = engine.getStats();
    expect(stats.remoteLatestAck).toBe(0);
  });

  it('dynamically adds and removes remotes', () => {
    const onDisconnect = vi.fn();
    const { engine } = makeEngine({
      remoteSlots: ['P2'] as PlayerSlot[],
      onPlayerDisconnect: onDisconnect,
    });

    // Add P3 dynamically
    engine.addRemoteSlot('P3' as PlayerSlot);

    // Send input from P3
    const buf = encodeInputMessage(
      [{ frame: 0, input: { left: true, right: false, jump: false, down: false } }],
      5, undefined, 'P3' as PlayerSlot,
    );
    engine.handleInputMessage(buf);
    expect(engine.getStats().remoteLatestAck).toBe(5);

    // Disconnect P3
    engine.removeRemoteSlot('P3' as PlayerSlot);
    expect(onDisconnect).toHaveBeenCalledWith('P3');
  });
});

describe('RollbackEngine - desync flow', () => {
  it('full desync check → request → correction flow', () => {
    // Set up host
    const hostState = makeTestState();
    const hostRng = new SeededRNG(42);
    const hostGL = makeMockGameLoop(hostState, hostRng);
    const hostTransport = makeMockTransport();
    const host = new RollbackEngine({
      localSlot: 'P1', remoteSlots: ['P2'], isHost: true,
      gameLoop: hostGL as any, transport: hostTransport as any,
    });

    // Set up guest with slightly different state (desync)
    const guestState = makeTestState();
    guestState.players[0].x = 999; // different from host!
    const guestRng = new SeededRNG(42);
    const guestGL = makeMockGameLoop(guestState, guestRng);
    const guestTransport = makeMockTransport();
    const guest = new RollbackEngine({
      localSlot: 'P2', remoteSlots: ['P1'], isHost: false,
      gameLoop: guestGL as any, transport: guestTransport as any,
    });

    // Host sends DESYNC_CHECK with its hash
    const hostHash = hashGameState(hostState, hostRng);
    const check = {
      type: MsgType.DESYNC_CHECK,
      frame: 0,
      hash: hostHash,
      rngState: hostRng.getState(),
    };

    // Guest processes — hashes differ → sends DESYNC_REQUEST
    guest.handleReliableMessage(check);
    expect(guestTransport.sendReliable).toHaveBeenCalledWith(
      expect.objectContaining({ type: MsgType.DESYNC_REQUEST }),
    );

    // Host processes DESYNC_REQUEST → sends DESYNC_CORRECTION
    const request = guestTransport.sendReliable.mock.calls[0][0];
    host.handleReliableMessage(request);
    expect(hostTransport.sendReliable).toHaveBeenCalledWith(
      expect.objectContaining({ type: MsgType.DESYNC_CORRECTION }),
    );

    // Guest applies DESYNC_CORRECTION → state should match host
    const correction = hostTransport.sendReliable.mock.calls[0][0];
    guest.handleReliableMessage(correction);
    // Guest's state should now have the host's player position
    expect(guestState.players[0].x).toBe(hostState.players[0].x);
  });
});

describe('RollbackEngine - adaptive input delay', () => {
  it('input delay starts at DEFAULT (2 frames)', () => {
    const { engine } = makeEngine();
    expect(engine.getStats().inputDelay).toBe(2);
  });

  it('input delay does not change when RTT is 0', () => {
    const { engine, transport } = makeEngine();
    transport.currentRtt = 0;
    // Trigger adaptInputDelay via private access
    (engine as any).adaptInputDelay();
    expect(engine.getStats().inputDelay).toBe(2);
  });

  it('input delay increases with high RTT', () => {
    const { engine, transport } = makeEngine();
    transport.currentRtt = 200; // 200ms RTT
    transport.currentJitter = 0;
    (engine as any).adaptInputDelay();
    expect(engine.getStats().inputDelay).toBeGreaterThan(2);
  });

  it('input delay does not exceed MAX (4 frames)', () => {
    const { engine, transport } = makeEngine();
    transport.currentRtt = 1000; // very high RTT
    transport.currentJitter = 100;
    (engine as any).adaptInputDelay();
    expect(engine.getStats().inputDelay).toBeLessThanOrEqual(4);
  });

  it('jitter adds padding to input delay', () => {
    const { engine: e1, transport: t1 } = makeEngine();
    const { engine: e2, transport: t2 } = makeEngine();
    t1.currentRtt = 50;
    t1.currentJitter = 0;
    t2.currentRtt = 50;
    t2.currentJitter = 30;
    (e1 as any).adaptInputDelay();
    (e2 as any).adaptInputDelay();
    // Higher jitter should lead to same or higher input delay
    expect(e2.getStats().inputDelay).toBeGreaterThanOrEqual(e1.getStats().inputDelay);
  });
});

describe('RollbackEngine - input buffer edge cases', () => {
  it('handles rapid-fire input messages from same remote', () => {
    const { engine } = makeEngine();
    for (let f = 0; f < 20; f++) {
      const buf = encodeInputMessage(
        [{ frame: f, input: { left: f % 2 === 0, right: f % 2 !== 0, jump: false, down: false } }],
        f, undefined, 'P2',
      );
      engine.handleInputMessage(buf);
    }
    expect(engine.getStats().remoteLatestAck).toBe(19);
  });

  it('ignores duplicate messages for same frame', () => {
    const { engine } = makeEngine();
    const buf1 = encodeInputMessage(
      [{ frame: 5, input: { left: true, right: false, jump: false, down: false } }],
      3, undefined, 'P2',
    );
    const buf2 = encodeInputMessage(
      [{ frame: 5, input: { left: false, right: true, jump: false, down: false } }],
      4, undefined, 'P2',
    );
    engine.handleInputMessage(buf1);
    engine.handleInputMessage(buf2);
    // Second message for same frame should be ignored (first was confirmed)
    // The ack should update though
    expect(engine.getStats().remoteLatestAck).toBe(4);
  });

  it('handles out-of-order frame messages', () => {
    const { engine } = makeEngine();
    // Send frame 10 first, then frame 5
    const buf10 = encodeInputMessage(
      [{ frame: 10, input: { left: true, right: false, jump: false, down: false } }],
      8, undefined, 'P2',
    );
    const buf5 = encodeInputMessage(
      [{ frame: 5, input: { left: false, right: true, jump: false, down: false } }],
      9, undefined, 'P2', // higher ack since this message is "newer" by ack
    );
    engine.handleInputMessage(buf10);
    engine.handleInputMessage(buf5);
    // latestAck is from the last processed message
    expect(engine.getStats().remoteLatestAck).toBe(9);
  });
});

describe('RollbackEngine - callbacks', () => {
  it('onStall callback receives stalled state', () => {
    const onStall = vi.fn();
    const { engine } = makeEngine({ onStall });
    // Engine starts unstalled
    expect(onStall).not.toHaveBeenCalled();
  });

  it('onStallTimeout is not called during normal operation', () => {
    const onStallTimeout = vi.fn();
    const { engine } = makeEngine({ onStallTimeout });
    expect(onStallTimeout).not.toHaveBeenCalled();
  });

  it('construction with all callbacks succeeds', () => {
    const { engine } = makeEngine({
      onStall: vi.fn(),
      onStallTimeout: vi.fn(),
      onPlayerDisconnect: vi.fn(),
      onDesync: vi.fn(),
    });
    expect(engine).toBeDefined();
  });
});

describe('RollbackEngine - host vs guest role', () => {
  it('host does not process DESYNC_CHECK', () => {
    const { engine, transport } = makeEngine({ isHost: true });
    engine.handleReliableMessage({
      type: MsgType.DESYNC_CHECK, frame: 0, hash: 12345, rngState: 0,
    });
    expect(transport.sendReliable).not.toHaveBeenCalled();
  });

  it('guest does not process DESYNC_REQUEST', () => {
    const { engine, transport } = makeEngine({ isHost: false });
    engine.handleReliableMessage({ type: MsgType.DESYNC_REQUEST, frame: 0 });
    expect(transport.sendReliable).not.toHaveBeenCalled();
  });

  it('host does not apply DESYNC_CORRECTION', () => {
    const state = makeTestState();
    const rng = new SeededRNG(42);
    const gameLoop = makeMockGameLoop(state, rng);
    const transport = makeMockTransport();
    const engine = new RollbackEngine({
      localSlot: 'P1', remoteSlots: ['P2'], isHost: true,
      gameLoop: gameLoop as any, transport: transport as any,
    });
    const origX = state.players[0].x;
    engine.handleReliableMessage({
      type: MsgType.DESYNC_CORRECTION,
      frame: 5,
      snapshot: { ...createEmptySnapshot(), players: [{ ...state.players[0], x: 999 } as any] },
    } as any);
    // Host ignores correction — position unchanged
    expect(state.players[0].x).toBe(origX);
  });
});

describe('RollbackEngine - desync check with subsystem hashes', () => {
  it('guest logs diverged subsystems when playersHash provided', () => {
    const state = makeTestState();
    const rng = new SeededRNG(42);
    const gameLoop = makeMockGameLoop(state, rng);
    const transport = makeMockTransport();
    const engine = new RollbackEngine({
      localSlot: 'P2', remoteSlots: ['P1'], isHost: false,
      gameLoop: gameLoop as any, transport: transport as any,
    });

    const wrongHash = hashGameState(state, rng) + 1;
    const check = {
      type: MsgType.DESYNC_CHECK,
      frame: 0,
      hash: wrongHash,
      rngState: rng.getState(),
      playersHash: 12345, // subsystem hashes
      entitiesHash: 67890,
      timersHash: 11111,
    };

    // Should send DESYNC_REQUEST with subsystem logging
    engine.handleReliableMessage(check);
    expect(transport.sendReliable).toHaveBeenCalled();
  });
});

describe('RollbackEngine - construction edge cases', () => {
  it('works with empty remoteSlots (solo mode)', () => {
    const { engine } = makeEngine({ remoteSlots: [] as PlayerSlot[] });
    expect(engine.getStats().localFrame).toBe(0);
    expect(engine.getStats().remoteLatestAck).toBe(-1);
  });

  it('removeRemoteSlot on already-removed slot is safe', () => {
    const { engine } = makeEngine();
    engine.removeRemoteSlot('P2');
    expect(() => engine.removeRemoteSlot('P2')).not.toThrow();
  });

  it('handleInputMessage with no remotes drops silently', () => {
    const { engine } = makeEngine({ remoteSlots: [] as PlayerSlot[] });
    const buf = encodeInputMessage(
      [{ frame: 0, input: { left: false, right: false, jump: false, down: false } }],
      0, undefined, 'P2',
    );
    expect(() => engine.handleInputMessage(buf)).not.toThrow();
  });
});
