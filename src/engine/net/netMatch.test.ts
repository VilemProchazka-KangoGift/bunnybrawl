import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetMatch } from './netMatch';
import type { NetMatchConfig } from './netMatch';
import { MsgType } from './protocol';
import type { PlayerSlot } from '../types';

// ---- Mock infrastructure ----

// Mock GameLoop constructor + instance
const mockGameLoopInstance = {
  setNetworkMode: vi.fn(),
  setRng: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  isPaused: vi.fn(() => false),
  getState: vi.fn(() => ({ players: [], matchOver: false, winner: null })),
  getInputAny: vi.fn(() => ({ left: false, right: false, jump: false, down: false })),
  getRng: vi.fn(() => null),
  getAIControllers: vi.fn(() => new Map()),
  fixedUpdate: vi.fn(),
  setAudioEnabled: vi.fn(),
  setResimulating: vi.fn(),
  setNetDebugStats: vi.fn(),
  renderFrame: vi.fn(),
  disconnectPlayer: vi.fn(),
  skipCountdown: vi.fn(),
};

vi.mock('../gameLoop', () => ({
  GameLoop: class MockGameLoop {
    constructor() { Object.assign(this, mockGameLoopInstance); }
  },
}));

// Mock RollbackEngine
const mockRollbackInstance = {
  start: vi.fn(),
  stop: vi.fn(),
  handleInputMessage: vi.fn(),
  handleReliableMessage: vi.fn(),
  removeRemoteSlot: vi.fn(),
  getStats: vi.fn(() => ({
    localFrame: 0, remoteConfirmedFrame: 0, remoteLatestAck: 0,
    rtt: 0, jitter: 0, inputDelay: 2, stalled: false,
    rollbacksPerSec: 0, maxRollbackDepth: 0,
  })),
};

vi.mock('./rollback', () => ({
  RollbackEngine: class MockRollbackEngine {
    constructor() { Object.assign(this, mockRollbackInstance); }
  },
}));

function makeMockTransport() {
  return {
    setEvents: vi.fn(),
    sendReliable: vi.fn(),
    sendUnreliable: vi.fn(),
    sendUnreliableTo: vi.fn(),
    getPeerIds: vi.fn(() => ['peer-a', 'peer-b']),
    peerCount: 2,
    currentRtt: 0,
    currentJitter: 0,
  };
}

function makeCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

function makeConfig(transport: ReturnType<typeof makeMockTransport>, overrides?: Partial<NetMatchConfig>): NetMatchConfig {
  return {
    bgCanvas: makeCanvas(),
    fgCanvas: makeCanvas(),
    arena: { platforms: [{ x: 0, y: 650, width: 1280, height: 70, isGround: true }], spawnPoints: [{ x: 200, y: 600 }], width: 1280, height: 720, navData: { nodes: [], edges: [] } } as any,
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
    transport = makeMockTransport();
    netMatch = new NetMatch(makeConfig(transport));
  });

  describe('construction', () => {
    it('creates successfully with valid config', () => {
      expect(netMatch).toBeDefined();
    });

    it('exposes getState() from game loop', () => {
      expect(netMatch.getState()).toBeDefined();
    });

    it('exposes getGameLoop()', () => {
      expect(netMatch.getGameLoop()).toBeDefined();
    });

    it('getRollbackStats() returns stats object', () => {
      const stats = netMatch.getRollbackStats();
      expect(stats).toBeDefined();
      expect(stats.localFrame).toBe(0);
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

    it('starts rollback engine', () => {
      netMatch.start();
      expect(mockRollbackInstance.start).toHaveBeenCalled();
    });
  });

  describe('handleUnreliableMessage()', () => {
    it('forwards input to rollback engine', () => {
      const data = new ArrayBuffer(10);
      netMatch.handleUnreliableMessage(data);
      expect(mockRollbackInstance.handleInputMessage).toHaveBeenCalledWith(data);
    });

    it('host relays input to other guests (excluding sender)', () => {
      transport.peerCount = 2;
      const data = new ArrayBuffer(10);
      netMatch.handleUnreliableMessage(data, 'peer-a');

      // Should relay to peer-b but not peer-a
      expect(transport.sendUnreliableTo).toHaveBeenCalledWith('peer-b', data);
      expect(transport.sendUnreliableTo).not.toHaveBeenCalledWith('peer-a', data);
    });

    it('host does not relay when only 1 peer', () => {
      transport.peerCount = 1;
      const data = new ArrayBuffer(10);
      netMatch.handleUnreliableMessage(data, 'peer-a');
      expect(transport.sendUnreliableTo).not.toHaveBeenCalled();
    });

    it('does not relay without fromPeerId', () => {
      transport.peerCount = 2;
      const data = new ArrayBuffer(10);
      netMatch.handleUnreliableMessage(data);
      expect(transport.sendUnreliableTo).not.toHaveBeenCalled();
    });

    it('guest does not relay (isHost=false)', () => {
      const guestTransport = makeMockTransport();
      guestTransport.peerCount = 2;
      const guestMatch = new NetMatch(makeConfig(guestTransport, {
        localSlot: 'P2' as PlayerSlot,
        remoteSlots: ['P1'] as PlayerSlot[],
      }));
      const data = new ArrayBuffer(10);
      guestMatch.handleUnreliableMessage(data, 'peer-a');
      expect(guestTransport.sendUnreliableTo).not.toHaveBeenCalled();
    });
  });

  describe('handleReliableMessage()', () => {
    it('routes DESYNC_CHECK to rollback', () => {
      netMatch.handleReliableMessage({ type: MsgType.DESYNC_CHECK, frame: 0, hash: 123, rngState: 0 });
      expect(mockRollbackInstance.handleReliableMessage).toHaveBeenCalled();
    });

    it('routes DESYNC_REQUEST to rollback', () => {
      netMatch.handleReliableMessage({ type: MsgType.DESYNC_REQUEST, frame: 0 });
      expect(mockRollbackInstance.handleReliableMessage).toHaveBeenCalled();
    });

    it('routes DESYNC_CORRECTION to rollback', () => {
      netMatch.handleReliableMessage({ type: MsgType.DESYNC_CORRECTION, frame: 0, snapshot: {} as any });
      expect(mockRollbackInstance.handleReliableMessage).toHaveBeenCalled();
    });

    it('PAUSE message pauses game loop', () => {
      netMatch.handleReliableMessage({ type: MsgType.PAUSE, paused: true } as any);
      expect(mockGameLoopInstance.pause).toHaveBeenCalled();
    });

    it('PAUSE message with paused=false resumes game loop', () => {
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
    it('removes remote slot from rollback + disconnects in gameLoop', () => {
      netMatch.removePlayer('P2' as PlayerSlot);
      expect(mockRollbackInstance.removeRemoteSlot).toHaveBeenCalledWith('P2');
      expect(mockGameLoopInstance.disconnectPlayer).toHaveBeenCalledWith('P2');
    });
  });

  describe('pause() / resume()', () => {
    it('pause() pauses game loop and broadcasts PAUSE', () => {
      netMatch.pause();
      expect(mockGameLoopInstance.pause).toHaveBeenCalled();
      expect(transport.sendReliable).toHaveBeenCalledWith(
        expect.objectContaining({ type: MsgType.PAUSE, paused: true }),
      );
    });

    it('resume() resumes game loop and broadcasts un-PAUSE', () => {
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
    it('stops rollback engine', () => {
      netMatch.stop();
      expect(mockRollbackInstance.stop).toHaveBeenCalled();
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

    it('onUnreliableMessage routes through handleUnreliableMessage', () => {
      netMatch.start();
      const events = transport.setEvents.mock.calls[0][0];
      const data = new ArrayBuffer(10);
      events.onUnreliableMessage(data, 'peer-a');
      expect(mockRollbackInstance.handleInputMessage).toHaveBeenCalledWith(data);
    });
  });
});
