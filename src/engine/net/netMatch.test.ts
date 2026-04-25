import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  getState: vi.fn(() => ({ players: [], matchOver: false, winner: null, phase: 'loading' })),
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
  tickCosmetic: vi.fn(),
  getRng: vi.fn(() => null),
  getAIControllers: vi.fn(() => new Map()),
  getAiRng: vi.fn(() => undefined),
  setOnPhaseChange: vi.fn(),
  setPhase: vi.fn(),
  setConnectionQuality: vi.fn(),
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
  getExpectedGuestSlots: vi.fn(() => [] as string[]),
  getSlotForPeer: vi.fn(() => undefined),
};

vi.mock('./hostAuthority', () => ({
  HostAuthority: class MockHostAuthority {
    constructor() { Object.assign(this, mockHostAuthorityInstance); }
  },
}));

// Capture the latest EntityInterpolation mock instance so tests can assert
// reset() was called from completeReconnection.
const interpInstances: Array<{
  pushSnapshot: ReturnType<typeof vi.fn>;
  getInterpolatedState: ReturnType<typeof vi.fn>;
  getLatestSnapshot: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
}> = [];
vi.mock('./interpolation', () => ({
  EntityInterpolation: class MockEntityInterpolation {
    pushSnapshot = vi.fn();
    getInterpolatedState = vi.fn(() => null);
    getLatestSnapshot = vi.fn(() => null);
    reset = vi.fn();
    constructor() { interpInstances.push(this); }
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

  describe('LOADED handshake (host)', () => {
    let transport: ReturnType<typeof makeMockTransport>;
    let netMatch: NetMatch;

    beforeEach(() => {
      transport = makeMockTransport(true);
      mockHostAuthorityInstance.getExpectedGuestSlots.mockReturnValue(['P2']);
      netMatch = new NetMatch(makeConfig(transport));
    });

    it('does NOT flip phase when only host loaded, no guests in', () => {
      netMatch.start();
      mockGameLoopInstance.setPhase.mockClear();
      netMatch.markHostLoaded();
      // P2 hasn't sent LOADED → still loading
      expect(mockGameLoopInstance.setPhase).not.toHaveBeenCalled();
    });

    it('does NOT flip phase when only guest loaded, host not loaded', () => {
      netMatch.start();
      mockGameLoopInstance.setPhase.mockClear();
      const events = transport.setEvents.mock.calls[0][0];
      events.onReliableMessage({ type: MsgType.LOADED, slot: 'P2' });
      // Host hasn't marked self loaded → still loading
      expect(mockGameLoopInstance.setPhase).not.toHaveBeenCalled();
    });

    it('flips phase to "playing" when host and all expected guests loaded', () => {
      netMatch.start();
      mockGameLoopInstance.setPhase.mockClear();
      netMatch.markHostLoaded();
      const events = transport.setEvents.mock.calls[0][0];
      events.onReliableMessage({ type: MsgType.LOADED, slot: 'P2' });
      expect(mockGameLoopInstance.setPhase).toHaveBeenCalledWith('playing');
    });

    it('flips phase only once even if LOADED arrives twice', () => {
      netMatch.start();
      netMatch.markHostLoaded();
      const events = transport.setEvents.mock.calls[0][0];
      events.onReliableMessage({ type: MsgType.LOADED, slot: 'P2' });
      // Simulate phase already flipped
      mockGameLoopInstance.getState.mockReturnValueOnce({ players: [], matchOver: false, winner: null, phase: 'playing' });
      mockGameLoopInstance.setPhase.mockClear();
      events.onReliableMessage({ type: MsgType.LOADED, slot: 'P2' });
      expect(mockGameLoopInstance.setPhase).not.toHaveBeenCalled();
    });
  });

  describe('armLoadingTimeout (host)', () => {
    let transport: ReturnType<typeof makeMockTransport>;
    let netMatch: NetMatch;
    let onLoadingTimeout: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      transport = makeMockTransport(true);
      mockHostAuthorityInstance.getExpectedGuestSlots.mockReturnValue(['P2', 'P3']);
      mockGameLoopInstance.getState.mockReturnValue({ players: [], matchOver: false, winner: null, phase: 'loading' });
      onLoadingTimeout = vi.fn();
      netMatch = new NetMatch(makeConfig(transport, { onLoadingTimeout }));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('fires onLoadingTimeout with laggard slots after 15s', () => {
      netMatch.start();
      // Only P2 sent LOADED; P3 is the laggard
      const events = transport.setEvents.mock.calls[0][0];
      events.onReliableMessage({ type: MsgType.LOADED, slot: 'P2' });
      onLoadingTimeout.mockClear();

      vi.advanceTimersByTime(14999);
      expect(onLoadingTimeout).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(onLoadingTimeout).toHaveBeenCalledTimes(1);
      expect(onLoadingTimeout).toHaveBeenCalledWith(['P3']);
    });

    it('disconnects laggards and forces phase=playing on timeout', () => {
      netMatch.start();
      mockGameLoopInstance.disconnectPlayer.mockClear();
      mockGameLoopInstance.setPhase.mockClear();
      vi.advanceTimersByTime(15001);
      // Both expected guests are laggards (no LOADED arrived)
      expect(mockGameLoopInstance.disconnectPlayer).toHaveBeenCalledWith('P2');
      expect(mockGameLoopInstance.disconnectPlayer).toHaveBeenCalledWith('P3');
      expect(mockGameLoopInstance.setPhase).toHaveBeenCalledWith('playing');
    });

    it('does NOT fire when phase already advanced before timeout', () => {
      netMatch.start();
      // Simulate the phase already being 'playing' by the time the timeout
      // hits — checkAllLoaded got there first.
      mockGameLoopInstance.getState.mockReturnValue({ players: [], matchOver: false, winner: null, phase: 'playing' });
      onLoadingTimeout.mockClear();
      vi.advanceTimersByTime(15001);
      expect(onLoadingTimeout).not.toHaveBeenCalled();
    });

    it('resetLoadingHandshake() re-arms the timer', () => {
      netMatch.start();
      vi.advanceTimersByTime(10000);
      netMatch.resetLoadingHandshake();
      onLoadingTimeout.mockClear();
      // 5s more from original start would have tripped the original timer;
      // resetLoadingHandshake should have restarted the clock.
      vi.advanceTimersByTime(5500);
      expect(onLoadingTimeout).not.toHaveBeenCalled();
      vi.advanceTimersByTime(10000);
      expect(onLoadingTimeout).toHaveBeenCalled();
    });

    it('stop() cancels the loading timeout', () => {
      netMatch.start();
      netMatch.stop();
      onLoadingTimeout.mockClear();
      vi.advanceTimersByTime(20000);
      expect(onLoadingTimeout).not.toHaveBeenCalled();
    });
  });

  describe('completeReconnection (guest)', () => {
    let transport: ReturnType<typeof makeMockTransport>;
    let netMatch: NetMatch;
    let onReconnecting: ReturnType<typeof vi.fn>;
    let onStall: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      transport = makeMockTransport(false);
      onReconnecting = vi.fn();
      onStall = vi.fn();
      // Clear instance log so we know which one our guest creates
      interpInstances.length = 0;
      netMatch = new NetMatch(makeConfig(transport, {
        localSlot: 'P2' as PlayerSlot,
        remoteSlots: ['P1'] as PlayerSlot[],
        onReconnecting,
        onStall,
      }));
    });

    it('RECONNECT_SYNC resets interpolation', () => {
      netMatch.start();
      const interp = interpInstances[interpInstances.length - 1];
      interp.reset.mockClear();
      const events = transport.setEvents.mock.calls[0][0];
      events.onReliableMessage({ type: MsgType.RECONNECT_SYNC, slot: 'P2', snapshotFrame: 100, paused: false });
      expect(interp.reset).toHaveBeenCalled();
    });

    it('RECONNECT_SYNC fires onReconnecting(false) and onStall(false)', () => {
      netMatch.start();
      onReconnecting.mockClear();
      onStall.mockClear();
      const events = transport.setEvents.mock.calls[0][0];
      events.onReliableMessage({ type: MsgType.RECONNECT_SYNC, slot: 'P2', snapshotFrame: 100, paused: false });
      expect(onReconnecting).toHaveBeenCalledWith(false);
      expect(onStall).toHaveBeenCalledWith(false);
    });

    it('RECONNECT_SYNC honors paused flag (host suspended)', () => {
      netMatch.start();
      mockGameLoopInstance.pause.mockClear();
      mockGameLoopInstance.resume.mockClear();
      const events = transport.setEvents.mock.calls[0][0];
      events.onReliableMessage({ type: MsgType.RECONNECT_SYNC, slot: 'P2', snapshotFrame: 100, paused: true });
      expect(mockGameLoopInstance.pause).toHaveBeenCalled();
    });

    it('RECONNECT_SYNC honors paused=false (host running)', () => {
      netMatch.start();
      mockGameLoopInstance.resume.mockClear();
      const events = transport.setEvents.mock.calls[0][0];
      events.onReliableMessage({ type: MsgType.RECONNECT_SYNC, slot: 'P2', snapshotFrame: 100, paused: false });
      expect(mockGameLoopInstance.resume).toHaveBeenCalled();
    });
  });

  describe('visibilitychange listener', () => {
    let transport: ReturnType<typeof makeMockTransport>;
    let addSpy: ReturnType<typeof vi.spyOn>;
    let removeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      transport = makeMockTransport(true);
      addSpy = vi.spyOn(document, 'addEventListener');
      removeSpy = vi.spyOn(document, 'removeEventListener');
    });

    afterEach(() => {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('start() registers a visibilitychange listener', () => {
      const nm = new NetMatch(makeConfig(transport));
      nm.start();
      const visibilityCalls = addSpy.mock.calls.filter(c => c[0] === 'visibilitychange');
      expect(visibilityCalls).toHaveLength(1);
      nm.stop();
    });

    it('stop() removes the visibilitychange listener', () => {
      const nm = new NetMatch(makeConfig(transport));
      nm.start();
      removeSpy.mockClear();
      nm.stop();
      const visibilityCalls = removeSpy.mock.calls.filter(c => c[0] === 'visibilitychange');
      expect(visibilityCalls).toHaveLength(1);
    });

    it('uses the same handler reference for add and remove (no listener leak)', () => {
      const nm = new NetMatch(makeConfig(transport));
      nm.start();
      const addedHandler = addSpy.mock.calls.find(c => c[0] === 'visibilitychange')?.[1];
      nm.stop();
      const removedHandler = removeSpy.mock.calls.find(c => c[0] === 'visibilitychange')?.[1];
      expect(addedHandler).toBe(removedHandler);
    });
  });
});
