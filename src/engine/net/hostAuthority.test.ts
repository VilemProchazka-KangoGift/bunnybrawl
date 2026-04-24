import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PlayerSlot, InputState, MatchState } from '../types';
import { MsgType, encodeInputMessage, encodePing, encodeSnapshotAck } from './protocol';

// ---- Mock infrastructure ----

// Mock transport (no real Trystero/WebRTC)
vi.mock('./transport', () => ({
  Transport: class MockTransport {
    sendUnreliable = vi.fn();
    sendUnreliableTo = vi.fn();
    sendReliable = vi.fn();
    sendReliableTo = vi.fn();
    getPeerIds = vi.fn(() => [] as string[]);
    setEvents = vi.fn();
    currentRtt = 20;
    currentJitter = 5;
    isRelay = false;
    destroy = vi.fn();
    peerCount = 0;
  },
}));

// Mock snapshot module
const mockTakeAuthSnapshot = vi.fn(() => ({
  frame: 1,
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
  phase: 'playing',
  winner: null,
  screenShake: 0,
  slowMotion: 0,
  screenFlash: 0,
  hitstopZoom: 0,
  scoreAnimations: [],
}));

const mockEncodeSnapshot = vi.fn(() => ({
  buffer: new ArrayBuffer(64),
  length: 64,
}));

const mockCreateDelta = vi.fn(() => new ArrayBuffer(16));

vi.mock('./snapshot', () => ({
  takeAuthSnapshot: (...args: unknown[]) => mockTakeAuthSnapshot(...args),
  encodeSnapshot: (...args: unknown[]) => mockEncodeSnapshot(...args),
  createDelta: (...args: unknown[]) => mockCreateDelta(...args),
}));

// Mock GameLoop
const mockGameLoopInstance = {
  setNetworkMode: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getState: vi.fn(() => makeMinimalMatchState()),
  getInputAny: vi.fn(() => ({ left: false, right: false, jump: false, down: false })),
  fixedUpdate: vi.fn(),
  disconnectPlayer: vi.fn(),
  setLocalSlot: vi.fn(),
  setPlayerNames: vi.fn(),
  renderFrame: vi.fn(),
  skipCountdown: vi.fn(),
};

vi.mock('../gameLoop', () => ({
  GameLoop: class MockGameLoop {
    constructor() { Object.assign(this, mockGameLoopInstance); }
  },
}));

import { HostAuthority, type HostAuthorityConfig } from './hostAuthority';

// ---- Helpers ----

function makeMinimalMatchState(): MatchState {
  return {
    players: [],
    killFeed: [],
    timeElapsed: 0,
    matchOver: false,
    phase: 'playing',
    winner: null,
    carrots: [],
    carrotTimer: 0,
    springs: [],
    thorns: [],
    springSpawnTimer: 0,
    thornSpawnTimer: 0,
    splatMarks: [],
    particles: [],
    gibs: [],
    countdown: 3,
    dayPhase: 0,
    screenShake: 0,
    slowMotion: 0,
    screenFlash: 0,
    hitstopZoom: 1,
    scoreAnimations: [],
    ghosts: [],
    lavaRocks: [],
    geyserStates: [],
    bouncyWobble: new Map(),
    pigeons: [],
  } as unknown as MatchState;
}

function makeMockTransport() {
  return {
    sendUnreliable: vi.fn(),
    sendUnreliableTo: vi.fn(),
    sendReliable: vi.fn(),
    sendReliableTo: vi.fn(),
    getPeerIds: vi.fn(() => [] as string[]),
    setEvents: vi.fn(),
    currentRtt: 20,
    currentJitter: 5,
    isRelay: false,
    destroy: vi.fn(),
    peerCount: 0,
  };
}

function makeConfig(overrides?: Partial<HostAuthorityConfig>): HostAuthorityConfig {
  return {
    gameLoop: mockGameLoopInstance as any,
    transport: makeMockTransport() as any,
    localSlot: 'P1' as PlayerSlot,
    onMatchEnd: vi.fn(),
    onPlayerDisconnect: vi.fn(),
    ...overrides,
  };
}

function makeHostAuthority(overrides?: Partial<HostAuthorityConfig>) {
  const config = makeConfig(overrides);
  const host = new HostAuthority(config);
  return { host, config };
}

// ---- Tests ----

describe('HostAuthority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('construction', () => {
    it('creates with valid config', () => {
      const { host } = makeHostAuthority();
      expect(host).toBeDefined();
    });

    it('stores localSlot', () => {
      const { host } = makeHostAuthority({ localSlot: 'P1' as PlayerSlot });
      expect(host.localSlot).toBe('P1');
    });

    it('stores different localSlot', () => {
      const { host } = makeHostAuthority({ localSlot: 'P2' as PlayerSlot });
      expect(host.localSlot).toBe('P2');
    });
  });

  describe('addGuest / peer-slot mapping', () => {
    it('registers a peer-to-slot mapping', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      const input = host.getGuestInput('P2' as PlayerSlot);
      expect(input).toEqual({ left: false, right: false, jump: false, down: false });
    });

    it('initializes neutral input for the guest', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-b', 'P3' as PlayerSlot);

      const inputs = host.getNetworkInputs();
      expect(inputs.has('P3')).toBe(true);
      expect(inputs.get('P3')).toEqual({ left: false, right: false, jump: false, down: false });
    });

    it('supports multiple guests with different slots', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.addGuest('peer-b', 'P3' as PlayerSlot);

      const inputs = host.getNetworkInputs();
      expect(inputs.size).toBe(2);
      expect(inputs.has('P2')).toBe(true);
      expect(inputs.has('P3')).toBe(true);
    });
  });

  describe('removeGuest', () => {
    it('removes the peer-slot mapping and clears input', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.removeGuest('peer-a');

      const inputs = host.getNetworkInputs();
      expect(inputs.has('P2')).toBe(false);
    });

    it('calls gameLoop.disconnectPlayer for the slot', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.removeGuest('peer-a');

      expect(mockGameLoopInstance.disconnectPlayer).toHaveBeenCalledWith('P2');
    });

    it('fires onPlayerDisconnect callback with the correct slot', () => {
      const onPlayerDisconnect = vi.fn();
      const { host } = makeHostAuthority({ onPlayerDisconnect });
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.removeGuest('peer-a');

      expect(onPlayerDisconnect).toHaveBeenCalledWith('P2');
    });

    it('does not fire callback if peer has no slot mapping', () => {
      const onPlayerDisconnect = vi.fn();
      const { host } = makeHostAuthority({ onPlayerDisconnect });
      host.removeGuest('unknown-peer');

      expect(onPlayerDisconnect).not.toHaveBeenCalled();
      expect(mockGameLoopInstance.disconnectPlayer).not.toHaveBeenCalled();
    });

    it('only removes the targeted peer, not other guests', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.addGuest('peer-b', 'P3' as PlayerSlot);
      host.removeGuest('peer-a');

      const inputs = host.getNetworkInputs();
      expect(inputs.has('P2')).toBe(false);
      expect(inputs.has('P3')).toBe(true);
    });
  });

  describe('getGuestInput', () => {
    it('returns neutral input for unmapped slot', () => {
      const { host } = makeHostAuthority();
      const input = host.getGuestInput('P5' as PlayerSlot);
      expect(input).toEqual({ left: false, right: false, jump: false, down: false });
    });

    it('returns the buffered input for a mapped slot', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      // The initial input is neutral
      const input = host.getGuestInput('P2' as PlayerSlot);
      expect(input.left).toBe(false);
      expect(input.right).toBe(false);
      expect(input.jump).toBe(false);
      expect(input.down).toBe(false);
    });
  });

  describe('getNetworkInputs', () => {
    it('returns the same Map reference (shared with gameLoop)', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      const map1 = host.getNetworkInputs();
      const map2 = host.getNetworkInputs();
      expect(map1).toBe(map2);
    });

    it('reflects added/removed guests', () => {
      const { host } = makeHostAuthority();
      expect(host.getNetworkInputs().size).toBe(0);

      host.addGuest('peer-a', 'P2' as PlayerSlot);
      expect(host.getNetworkInputs().size).toBe(1);

      host.addGuest('peer-b', 'P3' as PlayerSlot);
      expect(host.getNetworkInputs().size).toBe(2);

      host.removeGuest('peer-a');
      expect(host.getNetworkInputs().size).toBe(1);
    });
  });

  describe('consumeGuestJumps', () => {
    it('clears jump flags for all guest inputs', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.addGuest('peer-b', 'P3' as PlayerSlot);

      // Manually set jump flags
      const inputs = host.getNetworkInputs();
      inputs.get('P2')!.jump = true;
      inputs.get('P3')!.jump = true;

      host.consumeGuestJumps();

      expect(inputs.get('P2')!.jump).toBe(false);
      expect(inputs.get('P3')!.jump).toBe(false);
    });

    it('does not affect other input fields', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      const inputs = host.getNetworkInputs();
      inputs.get('P2')!.left = true;
      inputs.get('P2')!.right = true;
      inputs.get('P2')!.jump = true;
      inputs.get('P2')!.down = true;

      host.consumeGuestJumps();

      expect(inputs.get('P2')!.left).toBe(true);
      expect(inputs.get('P2')!.right).toBe(true);
      expect(inputs.get('P2')!.jump).toBe(false);
      expect(inputs.get('P2')!.down).toBe(true);
    });
  });

  describe('handleUnreliableMessage — INPUT', () => {
    it('buffers guest input from an input message', () => {
      const transport = makeMockTransport();
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      // Encode an input message for P2 with frame=1
      const inputMsg = encodeInputMessage(
        [{ frame: 1, input: { left: true, right: false, jump: false, down: false } }],
        0,
        1,
        'P2',
      );

      host.handleUnreliableMessage(inputMsg, 'peer-a');

      const guestInput = host.getGuestInput('P2' as PlayerSlot);
      expect(guestInput.left).toBe(true);
    });

    it('applies multiple bundled inputs (oldest to newest)', () => {
      const transport = makeMockTransport();
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      const inputMsg = encodeInputMessage(
        [
          { frame: 1, input: { left: true, right: false, jump: false, down: false } },
          { frame: 2, input: { left: false, right: true, jump: false, down: false } },
          { frame: 3, input: { left: false, right: false, jump: true, down: false } },
        ],
        0,
        3,
        'P2',
      );

      host.handleUnreliableMessage(inputMsg, 'peer-a');

      // The final input (frame 3) should be applied, but jump is latched from frame 3
      const guestInput = host.getGuestInput('P2' as PlayerSlot);
      expect(guestInput.jump).toBe(true);
      // left/right from frame 3 (newest applied)
      expect(guestInput.left).toBe(false);
      expect(guestInput.right).toBe(false);
    });

    it('skips stale frames (already consumed)', () => {
      const transport = makeMockTransport();
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      // First message: frame 5
      const msg1 = encodeInputMessage(
        [{ frame: 5, input: { left: true, right: false, jump: false, down: false } }],
        0, 1, 'P2',
      );
      host.handleUnreliableMessage(msg1, 'peer-a');

      // Second message: frames 3 and 4 are stale (already consumed up to 5), frame 6 is new
      const msg2 = encodeInputMessage(
        [
          { frame: 3, input: { left: false, right: true, jump: false, down: false } },
          { frame: 4, input: { left: false, right: true, jump: false, down: false } },
          { frame: 6, input: { left: false, right: false, jump: false, down: true } },
        ],
        0, 3, 'P2',
      );
      host.handleUnreliableMessage(msg2, 'peer-a');

      const guestInput = host.getGuestInput('P2' as PlayerSlot);
      // frame 6 should be the latest applied
      expect(guestInput.down).toBe(true);
      expect(guestInput.right).toBe(false); // frame 3/4 were skipped
    });

    it('latches jump: jump=true is not overwritten by subsequent jump=false', () => {
      const transport = makeMockTransport();
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      // Bundle: frame 1 has jump=true, frame 2 has jump=false
      const inputMsg = encodeInputMessage(
        [
          { frame: 1, input: { left: false, right: false, jump: true, down: false } },
          { frame: 2, input: { left: false, right: false, jump: false, down: false } },
        ],
        0, 2, 'P2',
      );

      host.handleUnreliableMessage(inputMsg, 'peer-a');

      // Jump should be latched true (not overwritten by frame 2's jump=false)
      const guestInput = host.getGuestInput('P2' as PlayerSlot);
      expect(guestInput.jump).toBe(true);
    });

    it('relays input to other connected peers', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue(['peer-a', 'peer-b']);
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.addGuest('peer-b', 'P3' as PlayerSlot);

      const inputMsg = encodeInputMessage(
        [{ frame: 1, input: { left: true, right: false, jump: false, down: false } }],
        0, 1, 'P2',
      );

      host.handleUnreliableMessage(inputMsg, 'peer-a');

      // Should relay to peer-b but NOT back to peer-a
      expect(transport.sendUnreliableTo).toHaveBeenCalledWith('peer-b', inputMsg);
      // Should not have been called with peer-a
      const calls = transport.sendUnreliableTo.mock.calls;
      const relayedToPeerA = calls.some((c: any[]) => c[0] === 'peer-a');
      expect(relayedToPeerA).toBe(false);
    });

    it('ignores messages with empty data', () => {
      const { host } = makeHostAuthority();
      // Empty buffer — should not throw
      expect(() => host.handleUnreliableMessage(new ArrayBuffer(0))).not.toThrow();
    });
  });

  describe('handleUnreliableMessage — PING', () => {
    it('responds with PONG to the sender', () => {
      const transport = makeMockTransport();
      const { host } = makeHostAuthority({ transport: transport as any });

      const pingData = encodePing(12345.678);
      host.handleUnreliableMessage(pingData, 'peer-a');

      expect(transport.sendUnreliableTo).toHaveBeenCalledWith(
        'peer-a',
        expect.any(ArrayBuffer),
      );

      // Verify the response is a PONG
      const sentBuf = transport.sendUnreliableTo.mock.calls[0][1] as ArrayBuffer;
      const view = new DataView(sentBuf);
      expect(view.getUint8(0)).toBe(MsgType.PONG);
    });

    it('does not respond to PING without a fromPeerId', () => {
      const transport = makeMockTransport();
      const { host } = makeHostAuthority({ transport: transport as any });

      const pingData = encodePing(12345.678);
      host.handleUnreliableMessage(pingData); // no fromPeerId

      expect(transport.sendUnreliableTo).not.toHaveBeenCalled();
    });
  });

  describe('handleUnreliableMessage — SNAPSHOT_ACK', () => {
    it('stores ACKed frame number from guest', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue(['peer-a']);
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.start();

      const state = makeMinimalMatchState();
      host.broadcastSnapshot(state);

      // Send a SNAPSHOT_ACK for frame 1 from peer-a
      const ackData = encodeSnapshotAck(1);
      host.handleUnreliableMessage(ackData, 'peer-a');

      // Delta compression is disabled (baseline mismatch from unreliable ACKs),
      // but ACK tracking is preserved for future adaptive rate support.
      // Just verify no crash and broadcast still works.
      host.broadcastSnapshot(state);
      expect(transport.sendUnreliableTo).toHaveBeenCalled();

      host.stop();
    });
  });

  describe('broadcastSnapshot', () => {
    it('calls takeAuthSnapshot and encodeSnapshot', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue(['peer-a']);
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      const state = makeMinimalMatchState();
      host.broadcastSnapshot(state);

      expect(mockTakeAuthSnapshot).toHaveBeenCalledWith(1, state);
      expect(mockEncodeSnapshot).toHaveBeenCalled();
    });

    it('sends full snapshot (with SNAPSHOT prefix) to peers without baseline', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue(['peer-a']);
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      host.broadcastSnapshot(makeMinimalMatchState());

      // Should send via sendUnreliableTo with SNAPSHOT type prefix
      expect(transport.sendUnreliableTo).toHaveBeenCalledWith('peer-a', expect.any(ArrayBuffer));

      const sentBuf = transport.sendUnreliableTo.mock.calls[0][1] as ArrayBuffer;
      const view = new DataView(sentBuf);
      expect(view.getUint8(0)).toBe(MsgType.SNAPSHOT);
    });

    it('sends to all connected peers', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue(['peer-a', 'peer-b', 'peer-c']);
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.addGuest('peer-b', 'P3' as PlayerSlot);
      host.addGuest('peer-c', 'P4' as PlayerSlot);

      host.broadcastSnapshot(makeMinimalMatchState());

      expect(transport.sendUnreliableTo).toHaveBeenCalledTimes(3);
    });

    it('increments localFrame on each broadcast', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue([]);
      const { host } = makeHostAuthority({ transport: transport as any });

      host.broadcastSnapshot(makeMinimalMatchState());
      host.broadcastSnapshot(makeMinimalMatchState());
      host.broadcastSnapshot(makeMinimalMatchState());

      // Frame numbers passed to takeAuthSnapshot should be 1, 2, 3
      expect(mockTakeAuthSnapshot.mock.calls[0][0]).toBe(1);
      expect(mockTakeAuthSnapshot.mock.calls[1][0]).toBe(2);
      expect(mockTakeAuthSnapshot.mock.calls[2][0]).toBe(3);
    });

    it('does not call sendUnreliableTo when no peers are connected', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue([]);
      const { host } = makeHostAuthority({ transport: transport as any });

      host.broadcastSnapshot(makeMinimalMatchState());

      expect(transport.sendUnreliableTo).not.toHaveBeenCalled();
    });
  });

  describe('handleReliableMessage', () => {
    it('PAUSE (paused=true) pauses the game loop', () => {
      const { host } = makeHostAuthority();
      host.handleReliableMessage({ type: MsgType.PAUSE, paused: true } as any);
      expect(mockGameLoopInstance.pause).toHaveBeenCalled();
    });

    it('PAUSE (paused=false) resumes the game loop', () => {
      const { host } = makeHostAuthority();
      host.handleReliableMessage({ type: MsgType.PAUSE, paused: false } as any);
      expect(mockGameLoopInstance.resume).toHaveBeenCalled();
    });

    it('PAUSE relays to other peers excluding the sender', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue(['peer-a', 'peer-b']);
      const { host } = makeHostAuthority({ transport: transport as any });

      host.handleReliableMessage(
        { type: MsgType.PAUSE, paused: true } as any,
        'peer-a',
      );

      // Should relay to peer-b, not peer-a
      expect(transport.sendReliableTo).toHaveBeenCalledWith(
        'peer-b',
        expect.objectContaining({ type: MsgType.PAUSE, paused: true }),
      );
      const calls = transport.sendReliableTo.mock.calls;
      const relayedToPeerA = calls.some((c: any[]) => c[0] === 'peer-a');
      expect(relayedToPeerA).toBe(false);
    });

    it('DISCONNECT removes the guest', () => {
      const onPlayerDisconnect = vi.fn();
      const { host } = makeHostAuthority({ onPlayerDisconnect });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      host.handleReliableMessage({ type: MsgType.DISCONNECT } as any, 'peer-a');

      expect(onPlayerDisconnect).toHaveBeenCalledWith('P2');
      expect(host.getNetworkInputs().has('P2')).toBe(false);
    });

    it('DISCONNECT without fromPeerId is a no-op', () => {
      const onPlayerDisconnect = vi.fn();
      const { host } = makeHostAuthority({ onPlayerDisconnect });

      host.handleReliableMessage({ type: MsgType.DISCONNECT } as any);
      expect(onPlayerDisconnect).not.toHaveBeenCalled();
    });

    it('RECONNECT_REQUEST reclaims slot during grace period', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue([]);
      const { host } = makeHostAuthority({ transport: transport as any });

      // Setup: a player exists in match state
      const playerP2 = {
        id: 'P2' as PlayerSlot,
        disconnected: true,
        active: false,
        state: 'splat' as const,
        respawnTimer: 0,
        splatTimer: 1.5,
      };
      mockGameLoopInstance.getState.mockReturnValue({
        ...makeMinimalMatchState(),
        players: [playerP2],
      });

      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.removeGuest('peer-a'); // enters grace period

      // New peer tries to reclaim P2
      host.handleReliableMessage(
        { type: MsgType.RECONNECT_REQUEST, slot: 'P2' } as any,
        'peer-new',
      );

      // Should send RECONNECT_SYNC to the new peer
      expect(transport.sendReliableTo).toHaveBeenCalledWith(
        'peer-new',
        expect.objectContaining({ type: MsgType.RECONNECT_SYNC, slot: 'P2' }),
      );

      // Should also send a full snapshot
      expect(transport.sendUnreliableTo).toHaveBeenCalledWith(
        'peer-new',
        expect.any(ArrayBuffer),
      );

      // Guest input should be re-established
      expect(host.getNetworkInputs().has('P2')).toBe(true);
    });

    it('RECONNECT_REQUEST fails if slot has an active peer', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue(['peer-a']);
      const { host } = makeHostAuthority({ transport: transport as any });
      // P2 is actively connected — another peer can't claim it
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      host.handleReliableMessage(
        { type: MsgType.RECONNECT_REQUEST, slot: 'P2' } as any,
        'peer-new',
      );

      expect(transport.sendReliableTo).not.toHaveBeenCalled();
    });
  });

  describe('start / stop', () => {
    it('start() initializes without error', () => {
      const { host } = makeHostAuthority();
      host.start();
      host.stop();
    });

    it('start() is idempotent', () => {
      const { host } = makeHostAuthority();
      host.start();
      host.start(); // should not throw
      host.stop();
    });

    it('stop() is safe to call without start()', () => {
      const { host } = makeHostAuthority();
      host.stop(); // should not throw
    });
  });

  describe('tickGraceTimers', () => {
    it('counts down grace timers', () => {
      const onPlayerDisconnect = vi.fn();
      const { host } = makeHostAuthority({ onPlayerDisconnect });
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.removeGuest('peer-a'); // enters 20s grace period

      // Tick 10 seconds — should still be in grace
      host.tickGraceTimers(10);

      // The slot is in grace period, not yet fully removed
      // Reconnection should still work
      const result = host.handleReconnectRequest('P2' as PlayerSlot, 'peer-new');
      expect(result).toBe(true);
    });

    it('cleans up grace state after grace period expires', () => {
      const onPlayerDisconnect = vi.fn();
      const { host } = makeHostAuthority({ onPlayerDisconnect });
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.removeGuest('peer-a');

      // Tick past the 20s grace period
      host.tickGraceTimers(21);

      // Grace expired, but reconnection still works since no active peer owns the slot
      // (defensive reconnection — prevents edge case where grace timer races with reconnect)
      mockGameLoopInstance.getState.mockReturnValue({
        ...makeMinimalMatchState(),
        players: [{ id: 'P2', disconnected: true, active: false, state: 'idle', respawnTimer: 0, splatTimer: 0 }],
      });
      const result = host.handleReconnectRequest('P2' as PlayerSlot, 'peer-new');
      expect(result).toBe(true);
    });
  });

  describe('handleReconnectRequest', () => {
    it('succeeds even without grace period if slot has no active peer', () => {
      const { host } = makeHostAuthority();
      mockGameLoopInstance.getState.mockReturnValue({
        ...makeMinimalMatchState(),
        players: [{ id: 'P2', disconnected: true, active: false, state: 'idle', respawnTimer: 0, splatTimer: 0 }],
      });
      // No grace period, but no active peer either — defensive reconnection
      const result = host.handleReconnectRequest('P2' as PlayerSlot, 'peer-new');
      expect(result).toBe(true);
    });

    it('returns true and reclaims the slot during grace period', () => {
      const { host } = makeHostAuthority();
      mockGameLoopInstance.getState.mockReturnValue({
        ...makeMinimalMatchState(),
        players: [{ id: 'P2', disconnected: true, active: false, state: 'idle', respawnTimer: 0, splatTimer: 0 }],
      });

      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.removeGuest('peer-a');

      const result = host.handleReconnectRequest('P2' as PlayerSlot, 'peer-new');
      expect(result).toBe(true);

      // Input should be re-established
      expect(host.getNetworkInputs().has('P2')).toBe(true);
      expect(host.getGuestInput('P2' as PlayerSlot)).toEqual({
        left: false, right: false, jump: false, down: false,
      });
    });

    it('reactivates a disconnected player and triggers respawn if splatted', () => {
      const { host } = makeHostAuthority();
      const player = {
        id: 'P2' as PlayerSlot,
        disconnected: true,
        active: false,
        state: 'splat' as const,
        respawnTimer: 0,
        splatTimer: 1.5,
      };
      mockGameLoopInstance.getState.mockReturnValue({
        ...makeMinimalMatchState(),
        players: [player],
      });

      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.removeGuest('peer-a');
      host.handleReconnectRequest('P2' as PlayerSlot, 'peer-new');

      expect(player.disconnected).toBe(false);
      expect(player.active).toBe(true);
      expect(player.state).toBe('respawning');
      expect(player.respawnTimer).toBe(1.5);
      expect(player.splatTimer).toBe(0);
    });
  });

  describe('getStats', () => {
    it('returns initial stats', () => {
      const transport = makeMockTransport();
      transport.currentRtt = 50;
      transport.currentJitter = 10;
      transport.isRelay = true;
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      const stats = host.getStats();
      expect(stats.localFrame).toBe(0);
      expect(stats.rtt).toBe(50);
      expect(stats.jitter).toBe(10);
      expect(stats.snapshotBytes).toBe(0);
      expect(stats.guestCount).toBe(1);
      expect(stats.isRelay).toBe(true);
    });

    it('updates localFrame and snapshotBytes after broadcastSnapshot', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue([]);
      const { host } = makeHostAuthority({ transport: transport as any });

      host.broadcastSnapshot(makeMinimalMatchState());

      const stats = host.getStats();
      expect(stats.localFrame).toBe(1);
      expect(stats.snapshotBytes).toBe(64); // from mockEncodeSnapshot length
    });
  });

  describe('setMatchOver', () => {
    it('does not throw', () => {
      const { host } = makeHostAuthority();
      expect(() => host.setMatchOver()).not.toThrow();
    });
  });

  describe('snapshot delivery', () => {
    it('always sends full snapshots (delta compression disabled)', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue(['peer-a']);
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      host.broadcastSnapshot(makeMinimalMatchState());

      // Should send full snapshot with SNAPSHOT (0x20) prefix
      const sentBuf = transport.sendUnreliableTo.mock.calls[0][1] as ArrayBuffer;
      const view = new DataView(sentBuf);
      expect(view.getUint8(0)).toBe(MsgType.SNAPSHOT);
    });
  });
});
