import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetMatch } from './netMatch';
import type { NetMatchConfig } from './netMatch';
import { MsgType } from './protocol';
import type { PlayerSlot } from '../types';

// ---- Mock infrastructure ----

const mockGameLoopInstance = {
  setNetworkMode: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  isPaused: vi.fn(() => false),
  getState: vi.fn(() => ({ players: [], matchOver: false, winner: null })),
  getInputAny: vi.fn(() => ({ left: false, right: false, jump: false, down: false })),
  fixedUpdate: vi.fn(),
  setPlayerNames: vi.fn(),
  setLocalSlot: vi.fn(),
  getTouchInput: vi.fn(() => null),
  renderFrame: vi.fn(),
  disconnectPlayer: vi.fn(),
  skipCountdown: vi.fn(),
  setNetDebugStats: vi.fn(),
  setAudioEnabled: vi.fn(),
  setResimulating: vi.fn(),
  cosmeticStep: vi.fn(),
  getRng: vi.fn(() => null),
  getAIControllers: vi.fn(() => new Map()),
  getAiRng: vi.fn(() => undefined),
};

vi.mock('../gameLoop', () => ({
  GameLoop: class MockGameLoop {
    constructor() { Object.assign(this, mockGameLoopInstance); }
  },
}));

// Mock HostAuthority
const mockHostAuthorityInstance = {
  start: vi.fn(),
  stop: vi.fn(),
  addGuest: vi.fn(),
  removeGuest: vi.fn(),
  handleUnreliableMessage: vi.fn(),
  handleReliableMessage: vi.fn(),
  getNetworkInputs: vi.fn(() => new Map()),
  getStats: vi.fn(() => ({ localFrame: 0, rtt: 0, jitter: 0, snapshotBytes: 0, snapshotBytesMean: 0, snapshotBytesMax: 0, guestCount: 1, isRelay: false })),
  setMatchOver: vi.fn(),
  broadcastSnapshot: vi.fn(),
  consumeGuestJumps: vi.fn(),
  tickGraceTimers: vi.fn(),
};

vi.mock('./hostAuthority', () => ({
  HostAuthority: class MockHostAuthority {
    constructor() { Object.assign(this, mockHostAuthorityInstance); }
  },
}));

vi.mock('./interpolation', () => ({
  EntityInterpolation: class MockEntityInterpolation {
    pushSnapshot = vi.fn();
    getInterpolatedState = vi.fn(() => null);
    getLatestSnapshot = vi.fn(() => null);
  },
  applySnapshotToState: vi.fn(),
}));



function makeMockTransport(isHost = true) {
  return {
    setEvents: vi.fn(),
    sendReliable: vi.fn(),
    sendReliableTo: vi.fn(),
    sendUnreliable: vi.fn(),
    sendUnreliableTo: vi.fn(),
    getPeerIds: vi.fn(() => ['peer-a']),
    peerCount: 1,
    currentRtt: 0,
    currentJitter: 0,
    isHost,
    isRelay: false,
  };
}

function makeCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

function makeConfig(transport: ReturnType<typeof makeMockTransport>, overrides?: Partial<NetMatchConfig>): NetMatchConfig {
  return {
    bgCanvas: makeCanvas(),
    fgCanvas: makeCanvas(),
    arena: { platforms: [{ x: 0, y: 650, width: 1280, height: 70 }], spawnPoints: [{ x: 200, y: 600 }], width: 1280, height: 720, id: 'meadow', name: 'Meadow', themeId: 'meadow' } as any,
    settings: { killLimit: 16, timeLimit: 0, mods: {} } as any,
    activePlayers: ['P1', 'P2'] as PlayerSlot[],
    onMatchEnd: vi.fn(),
    transport: transport as any,
    localSlot: 'P1' as PlayerSlot,
    remoteSlots: ['P2'] as PlayerSlot[],
    rngSeed: 42,
    ...overrides,
  };
}

describe('NetMatch', () => {
  let transport: ReturnType<typeof makeMockTransport>;
  let netMatch: NetMatch;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = makeMockTransport(true);
    netMatch = new NetMatch(makeConfig(transport));
  });

  describe('construction', () => {
    it('creates successfully with valid config', () => {
      expect(netMatch).toBeDefined();
    });

    it('exposes getState() from game loop (host)', () => {
      expect(netMatch.getState()).toBeDefined();
    });

    it('exposes getGameLoop() for host', () => {
      expect(netMatch.getGameLoop()).toBeDefined();
    });

    it('getDebugStats() returns stats (host)', () => {
      const stats = netMatch.getDebugStats();
      expect(stats).toBeDefined();
      expect(stats!.localFrame).toBe(0);
    });

    it('isHost reflects transport isHost', () => {
      expect(netMatch.isHost).toBe(true);
    });
  });

  describe('guest construction', () => {
    it('getGameLoop() returns a GameLoop for guest (used for rendering)', () => {
      const guestTransport = makeMockTransport(false);
      const guestMatch = new NetMatch(makeConfig(guestTransport, {
        localSlot: 'P2' as PlayerSlot,
        remoteSlots: ['P1'] as PlayerSlot[],
      }));
      expect(guestMatch.getGameLoop()).toBeDefined();
    });

    it('isHost is false for guest', () => {
      const guestTransport = makeMockTransport(false);
      const guestMatch = new NetMatch(makeConfig(guestTransport, {
        localSlot: 'P2' as PlayerSlot,
        remoteSlots: ['P1'] as PlayerSlot[],
      }));
      expect(guestMatch.isHost).toBe(false);
    });
  });

  describe('start()', () => {
    it('wires transport events', () => {
      netMatch.start();
      expect(transport.setEvents).toHaveBeenCalledWith(expect.objectContaining({
        onStatusChange: expect.any(Function),
        onReliableMessage: expect.any(Function),
        onUnreliableMessage: expect.any(Function),
        onRttUpdate: expect.any(Function),
      }));
    });

    it('starts host authority for host', () => {
      netMatch.start();
      expect(mockHostAuthorityInstance.start).toHaveBeenCalled();
    });
  });

  describe('handleUnreliableMessage()', () => {
    it('host forwards to HostAuthority', () => {
      const data = new ArrayBuffer(10);
      netMatch.handleUnreliableMessage(data, 'peer-a');
      expect(mockHostAuthorityInstance.handleUnreliableMessage).toHaveBeenCalledWith(data, 'peer-a');
    });
  });

  describe('handleReliableMessage()', () => {
    it('PAUSE message pauses game loop (host)', () => {
      netMatch.handleReliableMessage({ type: MsgType.PAUSE, paused: true } as any);
      expect(mockGameLoopInstance.pause).toHaveBeenCalled();
    });

    it('PAUSE with paused=false resumes game loop', () => {
      netMatch.handleReliableMessage({ type: MsgType.PAUSE, paused: false } as any);
      expect(mockGameLoopInstance.resume).toHaveBeenCalled();
    });

    it('SETTINGS_SYNC with arenaId calls onArenaChange', () => {
      const onArenaChange = vi.fn();
      const nm = new NetMatch(makeConfig(transport, { onArenaChange }));
      nm.handleReliableMessage({ type: MsgType.SETTINGS_SYNC, arenaId: 'volcano' } as any);
      expect(onArenaChange).toHaveBeenCalledWith('volcano');
    });

    it('MATCH_RESULT calls onMatchEnd', () => {
      const onMatchEnd = vi.fn();
      const nm = new NetMatch(makeConfig(transport, { onMatchEnd }));
      nm.handleReliableMessage({ type: MsgType.MATCH_RESULT, winner: 'P1' } as any);
      expect(onMatchEnd).toHaveBeenCalledWith('P1', expect.anything());
    });

    it('DISCONNECT calls onDisconnect', () => {
      const onDisconnect = vi.fn();
      const nm = new NetMatch(makeConfig(transport, { onDisconnect }));
      nm.handleReliableMessage({ type: MsgType.DISCONNECT } as any);
      expect(onDisconnect).toHaveBeenCalled();
    });
  });

  describe('removePlayer()', () => {
    it('disconnects player in game loop (host)', () => {
      netMatch.removePlayer('P2' as PlayerSlot);
      expect(mockGameLoopInstance.disconnectPlayer).toHaveBeenCalledWith('P2');
    });
  });

  describe('pause() / resume()', () => {
    it('pause() pauses game loop and broadcasts', () => {
      netMatch.pause();
      expect(mockGameLoopInstance.pause).toHaveBeenCalled();
      expect(transport.sendReliable).toHaveBeenCalledWith(
        expect.objectContaining({ type: MsgType.PAUSE, paused: true }),
      );
    });

    it('resume() resumes game loop and broadcasts', () => {
      netMatch.resume();
      expect(mockGameLoopInstance.resume).toHaveBeenCalled();
      expect(transport.sendReliable).toHaveBeenCalledWith(
        expect.objectContaining({ type: MsgType.PAUSE, paused: false }),
      );
    });

    it('isPaused() delegates to game loop', () => {
      mockGameLoopInstance.isPaused.mockReturnValue(true);
      expect(netMatch.isPaused()).toBe(true);
    });
  });

  describe('stop()', () => {
    it('stops host authority and game loop', () => {
      netMatch.stop();
      expect(mockHostAuthorityInstance.stop).toHaveBeenCalled();
      expect(mockGameLoopInstance.stop).toHaveBeenCalled();
    });
  });

  describe('skipCountdown()', () => {
    it('delegates to game loop', () => {
      netMatch.skipCountdown();
      expect(mockGameLoopInstance.skipCountdown).toHaveBeenCalled();
    });
  });

  describe('transport event wiring', () => {
    it('onStatusChange disconnected triggers onDisconnect', () => {
      const onDisconnect = vi.fn();
      const nm = new NetMatch(makeConfig(transport, { onDisconnect }));
      nm.start();

      const events = transport.setEvents.mock.calls[0][0];
      events.onStatusChange('disconnected');
      expect(onDisconnect).toHaveBeenCalled();
    });

    it('onStatusChange error triggers onDisconnect', () => {
      const onDisconnect = vi.fn();
      const nm = new NetMatch(makeConfig(transport, { onDisconnect }));
      nm.start();

      const events = transport.setEvents.mock.calls[0][0];
      events.onStatusChange('error', 'some error');
      expect(onDisconnect).toHaveBeenCalled();
    });

    it('onStatusChange connected does not trigger onDisconnect', () => {
      const onDisconnect = vi.fn();
      const nm = new NetMatch(makeConfig(transport, { onDisconnect }));
      nm.start();

      const events = transport.setEvents.mock.calls[0][0];
      events.onStatusChange('connected');
      expect(onDisconnect).not.toHaveBeenCalled();
    });

    it('onReliableMessage routes through handleReliableMessage', () => {
      netMatch.start();
      const events = transport.setEvents.mock.calls[0][0];
      events.onReliableMessage({ type: MsgType.PAUSE, paused: true });
      expect(mockGameLoopInstance.pause).toHaveBeenCalled();
    });

    it('onUnreliableMessage routes to host authority', () => {
      netMatch.start();
      const events = transport.setEvents.mock.calls[0][0];
      const data = new ArrayBuffer(10);
      events.onUnreliableMessage(data, 'peer-a');
      expect(mockHostAuthorityInstance.handleUnreliableMessage).toHaveBeenCalledWith(data, 'peer-a');
    });
  });
});
