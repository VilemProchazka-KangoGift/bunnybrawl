import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PlayerSlot, InputState, MatchState } from '../types';
import { MsgType, encodeInputMessage, encodePing } from './protocol';
import { makeState } from '../__tests__/testHelpers';

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
  isPaused: vi.fn(() => false),
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
  return makeState({ countdown: 3, hitstopZoom: 1 });
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

      host.consumeGuestJumps(['P2' as PlayerSlot, 'P3' as PlayerSlot]);

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

      host.consumeGuestJumps(['P2' as PlayerSlot]);

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

    it('rejects spoofed source slot from a different peer', () => {
      // P2 (peer-a) tries to spoof P3's slot — must be rejected even though
      // P3 is a real registered slot.
      const transport = makeMockTransport();
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      host.addGuest('peer-b', 'P3' as PlayerSlot);

      const spoofMsg = encodeInputMessage(
        [{ frame: 1, input: { left: true, right: false, jump: false, down: false } }],
        0, 1, 'P3', // peer-a sending input claiming to be P3
      );
      host.handleUnreliableMessage(spoofMsg, 'peer-a');

      // P3's slot should NOT have been mutated by peer-a's spoof
      const p3Input = host.getGuestInput('P3' as PlayerSlot);
      expect(p3Input).toEqual({ left: false, right: false, jump: false, down: false });
    });

    it('rejects spoofed bot slot input', () => {
      // Bots run on host only. A guest must not be able to drive a bot's input.
      const transport = makeMockTransport();
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      const spoofMsg = encodeInputMessage(
        [{ frame: 1, input: { left: true, right: true, jump: true, down: false } }],
        0, 1, 'B1' as PlayerSlot,
      );
      host.handleUnreliableMessage(spoofMsg, 'peer-a');

      const inputs = host.getNetworkInputs();
      // B1 must not have been added to the inputs map
      expect(inputs.has('B1')).toBe(false);
    });

    it('intra-bundle non-monotonic ordering does not let an older entry overwrite a newer one', () => {
      // The host iterates bundle entries in order. Without a per-call max
      // tracker, [F=10, F=5, F=8] would all pass the lastConsumedFrame check
      // (which is read once before the loop) and the older entry F=5 would
      // overwrite the newer F=10's left/right/down fields.
      const transport = makeMockTransport();
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      const msg = encodeInputMessage(
        [
          { frame: 10, input: { left: false, right: true, jump: false, down: false } },
          { frame: 5,  input: { left: true,  right: false, jump: false, down: false } },
          { frame: 8,  input: { left: true,  right: false, jump: false, down: false } },
        ],
        0, 3, 'P2',
      );
      host.handleUnreliableMessage(msg, 'peer-a');

      // Newest frame's input wins (right=true), not the older entries' left=true
      const input = host.getGuestInput('P2' as PlayerSlot);
      expect(input.right).toBe(true);
      expect(input.left).toBe(false);
    });
  });

  describe('counter-reset detection (Uint32 wraparound)', () => {
    it('treats a frame counter that has dropped >>1M frames as a reset', () => {
      // Simulates the Uint32 wraparound case: host's lastConsumedFrame is
      // near MAX_UINT32 (e.g. 4_290_000_000), guest's wire frame wrapped
      // to 0 and is now climbing slowly. Without the counter-reset guard,
      // every input would be silently discarded (`entry.frame <= lastFrame`)
      // forever.
      const transport = makeMockTransport();
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      // Burn lastConsumedFrame to a very high value (we use 5,000,000 so
      // the gap is comfortably > 1M — exact value chosen for readability).
      const burnMsg = encodeInputMessage(
        [{ frame: 5_000_000, input: { left: false, right: true, jump: false, down: false } }],
        0, 1, 'P2',
      );
      host.handleUnreliableMessage(burnMsg, 'peer-a');

      // Now a "wrapped" bundle arrives — newest is 1, drops far below stored.
      const wrappedMsg = encodeInputMessage(
        [{ frame: 1, input: { left: true, right: false, jump: true, down: false } }],
        0, 1, 'P2',
      );
      host.handleUnreliableMessage(wrappedMsg, 'peer-a');

      const input = host.getGuestInput('P2' as PlayerSlot);
      expect(input.left).toBe(true);
      expect(input.right).toBe(false);
      expect(input.jump).toBe(true);
    });

    it('does NOT reset on a small backward drift (network reorder, not wraparound)', () => {
      // A normal out-of-order packet (e.g. F=100 arrives after F=105) must
      // NOT be treated as a counter reset — that would re-accept already-
      // applied inputs and overwrite newer state.
      const transport = makeMockTransport();
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      const newer = encodeInputMessage(
        [{ frame: 105, input: { left: false, right: true, jump: false, down: false } }],
        0, 1, 'P2',
      );
      host.handleUnreliableMessage(newer, 'peer-a');

      const older = encodeInputMessage(
        [{ frame: 100, input: { left: true, right: false, jump: false, down: false } }],
        0, 1, 'P2',
      );
      host.handleUnreliableMessage(older, 'peer-a');

      // Older entry must NOT have overwritten the newer one (left=true would
      // indicate a spurious reset acceptance).
      const input = host.getGuestInput('P2' as PlayerSlot);
      expect(input.right).toBe(true);
      expect(input.left).toBe(false);
    });
  });

  describe('removeGuest — lastConsumedFrame cleanup', () => {
    it('clears lastConsumedFrame so a fresh peer in the same slot is accepted', () => {
      // Simulate the bare-transport-recycle path: peer disconnects and
      // immediately rejoins into the same slot WITHOUT going through the
      // RECONNECT_REQUEST flow. Without the cleanup fix, the new peer's
      // fresh frame counter (starting at 1) would lose to the host's stale
      // lastConsumedFrame (e.g. 100), discarding all inputs silently.
      const transport = makeMockTransport();
      const { host } = makeHostAuthority({ transport: transport as any });
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      // Burn lastConsumedFrame up to 100
      const burnMsg = encodeInputMessage(
        [{ frame: 100, input: { left: false, right: true, jump: false, down: false } }],
        0, 1, 'P2',
      );
      host.handleUnreliableMessage(burnMsg, 'peer-a');

      // Peer disconnects and a fresh peer takes over the same slot
      host.removeGuest('peer-a');
      host.addGuest('peer-b', 'P2' as PlayerSlot);

      // Fresh peer sends frame=1 — must be accepted, not silently dropped
      const freshMsg = encodeInputMessage(
        [{ frame: 1, input: { left: true, right: false, jump: false, down: false } }],
        0, 1, 'P2',
      );
      host.handleUnreliableMessage(freshMsg, 'peer-b');

      const input = host.getGuestInput('P2' as PlayerSlot);
      expect(input.left).toBe(true);
      expect(input.right).toBe(false);
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

      host.addGuest('peer-a', 'P2' as PlayerSlot, 'tok');
      host.removeGuest('peer-a'); // enters grace period

      // New peer tries to reclaim P2 — returns true on success
      const ok = host.handleReconnectRequest('P2' as PlayerSlot, 'peer-new', 'tok');
      expect(ok).toBe(true);

      // Guest input is re-established on reclaim (the SYNC ack + fresh
      // snapshot are sent by NetMatch, not by HostAuthority directly)
      expect(host.getNetworkInputs().has('P2')).toBe(true);

      // sendSnapshotTo can be used by the orchestrator to push a one-off
      // snapshot to the reclaiming peer.
      host.sendSnapshotTo('peer-new', mockGameLoopInstance.getState() as any);
      expect(transport.sendUnreliableTo).toHaveBeenCalledWith(
        'peer-new',
        expect.any(ArrayBuffer),
      );
    });

    it('RECONNECT_REQUEST fails if slot has an active peer', () => {
      const transport = makeMockTransport();
      transport.getPeerIds.mockReturnValue(['peer-a']);
      const { host } = makeHostAuthority({ transport: transport as any });
      // P2 is actively connected — another peer can't claim it
      host.addGuest('peer-a', 'P2' as PlayerSlot);

      const ok = host.handleReconnectRequest('P2' as PlayerSlot, 'peer-new');
      expect(ok).toBe(false);
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
      host.addGuest('peer-a', 'P2' as PlayerSlot, 'tok');
      host.removeGuest('peer-a'); // enters 20s grace period

      // Tick 10 seconds — should still be in grace
      host.tickGraceTimers(10);

      // The slot is in grace period, not yet fully removed
      // Reconnection should still work
      const result = host.handleReconnectRequest('P2' as PlayerSlot, 'peer-new', 'tok');
      expect(result).toBe(true);
    });

    it('cleans up grace state after grace period expires; token preserved for late reclaim', () => {
      const onPlayerDisconnect = vi.fn();
      const { host } = makeHostAuthority({ onPlayerDisconnect });
      host.addGuest('peer-a', 'P2' as PlayerSlot, 'tok');
      host.removeGuest('peer-a');

      // Tick past the 20s grace period
      host.tickGraceTimers(21);

      // Grace expired but the reclaim token is intentionally retained — the
      // ORIGINAL peer can still reclaim with their token after a long
      // disconnect (phone call, brief tab close), but a STRANGER cannot
      // claim the abandoned slot.
      mockGameLoopInstance.getState.mockReturnValue({
        ...makeMinimalMatchState(),
        players: [{ id: 'P2', disconnected: true, active: false, state: 'idle', respawnTimer: 0, splatTimer: 0 }],
      });
      // Stranger reclaim — rejected.
      expect(host.handleReconnectRequest('P2' as PlayerSlot, 'stranger', 'wrong')).toBe(false);
      expect(host.handleReconnectRequest('P2' as PlayerSlot, 'stranger')).toBe(false);
      // Original peer with correct token — accepted.
      expect(host.handleReconnectRequest('P2' as PlayerSlot, 'original', 'tok')).toBe(true);
    });
  });

  describe('handleReconnectRequest', () => {
    it('rejects reclaim with wrong token (security)', () => {
      // Without token validation, any peer in the room could claim a
      // disconnected stranger's slot to steal their score.
      const { host } = makeHostAuthority();
      mockGameLoopInstance.getState.mockReturnValue({
        ...makeMinimalMatchState(),
        players: [{ id: 'P2', disconnected: true, active: false, state: 'idle', respawnTimer: 0, splatTimer: 0 }],
      });

      host.addGuest('peer-a', 'P2' as PlayerSlot, 'real-token');
      host.removeGuest('peer-a');

      // Wrong token rejected.
      expect(host.handleReconnectRequest('P2' as PlayerSlot, 'attacker-peer', 'guess')).toBe(false);
      // No token rejected.
      expect(host.handleReconnectRequest('P2' as PlayerSlot, 'attacker-peer')).toBe(false);
      // Right token accepted.
      expect(host.handleReconnectRequest('P2' as PlayerSlot, 'real-peer', 'real-token')).toBe(true);
    });

    it('getReclaimToken returns the token issued in addGuest', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-a', 'P2' as PlayerSlot, 'preset-token');
      expect(host.getReclaimToken('P2' as PlayerSlot)).toBe('preset-token');
    });

    it('addGuest auto-generates a token when none is provided', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-a', 'P2' as PlayerSlot);
      const token = host.getReclaimToken('P2' as PlayerSlot);
      expect(token).toBeTruthy();
      expect(token!.length).toBeGreaterThanOrEqual(32);
    });

    it('preserves the reclaim token past grace expiry (no stranger bypass)', () => {
      // Regression: finalRemoveGuest used to delete the token. With it gone,
      // the post-grace path saw storedToken=undefined and the validation
      // `if (storedToken && ...)` fell through, allowing any stranger to
      // claim the abandoned slot — defeating the auth fix.
      const { host } = makeHostAuthority();
      mockGameLoopInstance.getState.mockReturnValue({
        ...makeMinimalMatchState(),
        players: [{ id: 'P2', disconnected: true, active: false, state: 'idle', respawnTimer: 0, splatTimer: 0 }],
      });
      host.addGuest('peer-a', 'P2' as PlayerSlot, 'survives-grace');
      host.removeGuest('peer-a');
      host.tickGraceTimers(21); // past 20s grace

      // Stranger without token is still rejected.
      expect(host.handleReconnectRequest('P2' as PlayerSlot, 'stranger')).toBe(false);
      expect(host.handleReconnectRequest('P2' as PlayerSlot, 'stranger', 'guess')).toBe(false);
      // Original peer with their token is accepted.
      expect(host.handleReconnectRequest('P2' as PlayerSlot, 'original', 'survives-grace')).toBe(true);
    });

    it('stop() drops all reclaim tokens (match-end lifetime boundary)', () => {
      const { host } = makeHostAuthority();
      host.addGuest('peer-a', 'P2' as PlayerSlot, 'tok-a');
      host.addGuest('peer-b', 'P3' as PlayerSlot, 'tok-b');
      expect(host.getReclaimToken('P2' as PlayerSlot)).toBe('tok-a');
      expect(host.getReclaimToken('P3' as PlayerSlot)).toBe('tok-b');

      host.stop();

      expect(host.getReclaimToken('P2' as PlayerSlot)).toBeNull();
      expect(host.getReclaimToken('P3' as PlayerSlot)).toBeNull();
    });

    it('rejects reclaim attempt for the host\'s own localSlot (security)', () => {
      // A malicious or buggy guest could send RECONNECT_REQUEST{slot: localSlot}
      // and hijack input authority over the host's player. localSlot is never
      // in peerSlotMap (which tracks remote peers), so without the explicit
      // guard the slot would appear "available for reclaim".
      const { host } = makeHostAuthority({ localSlot: 'P1' as PlayerSlot });
      mockGameLoopInstance.getState.mockReturnValue({
        ...makeMinimalMatchState(),
        players: [{ id: 'P1', disconnected: false, active: true, state: 'idle', respawnTimer: 0, splatTimer: 0 }],
      });

      const result = host.handleReconnectRequest('P1' as PlayerSlot, 'malicious-peer');

      expect(result).toBe(false);
      // Mapping must NOT have been added.
      expect(host.getNetworkInputs().has('P1')).toBe(false);
    });

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

      host.addGuest('peer-a', 'P2' as PlayerSlot, 'token-abc');
      host.removeGuest('peer-a');

      const result = host.handleReconnectRequest('P2' as PlayerSlot, 'peer-new', 'token-abc');
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

      host.addGuest('peer-a', 'P2' as PlayerSlot, 'token-xyz');
      host.removeGuest('peer-a');
      host.handleReconnectRequest('P2' as PlayerSlot, 'peer-new', 'token-xyz');

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

describe('generateReclaimToken (exported)', () => {
  it('produces a 32-char lowercase hex string (128 bits of entropy)', async () => {
    const { generateReclaimToken } = await import('./core/hostAuthority');
    const token = generateReclaimToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produces distinct tokens across calls (no fixed seed)', async () => {
    const { generateReclaimToken } = await import('./core/hostAuthority');
    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) seen.add(generateReclaimToken());
    expect(seen.size).toBe(64);
  });

  it('is re-exported from net/core barrel for non-core callers (lobby/useOnlineRoom)', async () => {
    const core = await import('./core');
    expect(typeof core.generateReclaimToken).toBe('function');
    expect(core.generateReclaimToken()).toMatch(/^[0-9a-f]{32}$/);
  });
});
