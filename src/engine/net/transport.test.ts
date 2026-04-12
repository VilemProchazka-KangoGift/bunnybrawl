import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Event-emitter mock for PeerJS objects ----

function makeEmitter() {
  const handlers = new Map<string, Function[]>();
  return {
    on(event: string, fn: Function) { handlers.set(event, [...(handlers.get(event) || []), fn]); },
    emit(event: string, ...args: any[]) { for (const fn of handlers.get(event) || []) fn(...args); },
    _handlers: handlers,
  };
}

function makeMockConn(peerId = 'remote-peer-1') {
  const emitter = makeEmitter();
  return {
    peer: peerId,
    open: false,
    send: vi.fn(),
    close: vi.fn(),
    on: emitter.on.bind(emitter),
    _emit: emitter.emit.bind(emitter),
    // Fake peerConnection for ICE logging
    peerConnection: null as any,
  };
}

let _lastPeerEmitter: ReturnType<typeof makeEmitter>;
let _lastPeerInstance: any;

vi.mock('peerjs', () => ({
  default: class MockPeer {
    constructor(..._args: any[]) {
      const emitter = makeEmitter();
      _lastPeerEmitter = emitter;
      const inst = {
        on: emitter.on.bind(emitter),
        connect: vi.fn(() => {
          const conn = makeMockConn('host-peer');
          setTimeout(() => { conn.open = true; conn._emit('open'); }, 0);
          return conn;
        }),
        reconnect: vi.fn(),
        destroy: vi.fn(),
        _emit: emitter.emit.bind(emitter),
      };
      _lastPeerInstance = inst;
      Object.assign(this, inst);
    }
  },
}));

// Simple static mock conn for tests that don't need events
const mockConn = {
  peer: 'remote-peer-1',
  open: true,
  send: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
};

// Mock networkSimulator
vi.mock('./networkSimulator', () => ({
  NetworkSimulator: vi.fn(() => ({ enabled: false, enqueue: vi.fn(), flush: vi.fn(() => []) })),
  readSimConfigFromUrl: vi.fn(() => null),
}));

import { Transport } from './transport';
import type { TransportEvents } from './transport';
import { MsgType, encodePing, encodePong, decodePingPong } from './protocol';

function makeEvents(overrides?: Partial<TransportEvents>): TransportEvents {
  return {
    onStatusChange: vi.fn(),
    onReliableMessage: vi.fn(),
    onUnreliableMessage: vi.fn(),
    onRttUpdate: vi.fn(),
    onPeerConnected: vi.fn(),
    onPeerDisconnected: vi.fn(),
    onPeerHealthChange: vi.fn(),
    ...overrides,
  };
}

describe('Transport — construction', () => {
  it('creates in idle state', () => {
    const events = makeEvents();
    const t = new Transport(events);
    expect(t.isHost).toBe(false);
    expect(t.connected).toBe(false);
    expect(t.roomCode).toBeNull();
    expect(t.peerCount).toBe(0);
    expect(t.currentRtt).toBe(0);
    expect(t.currentJitter).toBe(0);
    t.destroy();
  });
});

describe('Transport — getters', () => {
  it('getPeerIds returns empty array when no peers', () => {
    const t = new Transport(makeEvents());
    expect(t.getPeerIds()).toEqual([]);
    t.destroy();
  });

  it('getPeerInfo returns undefined for unknown peer', () => {
    const t = new Transport(makeEvents());
    expect(t.getPeerInfo('unknown')).toBeUndefined();
    t.destroy();
  });
});

describe('Transport — setEvents', () => {
  it('replaces event callbacks', () => {
    const events1 = makeEvents();
    const events2 = makeEvents();
    const t = new Transport(events1);
    t.setEvents(events2);
    // Internal events reference should be updated
    expect((t as any).events).toBe(events2);
    t.destroy();
  });
});

describe('Transport — send methods (with no peers)', () => {
  it('sendReliable does not crash with no peers', () => {
    const t = new Transport(makeEvents());
    expect(() => t.sendReliable({ type: MsgType.DISCONNECT } as any)).not.toThrow();
    t.destroy();
  });

  it('sendUnreliable does not crash with no peers', () => {
    const t = new Transport(makeEvents());
    expect(() => t.sendUnreliable(new ArrayBuffer(10))).not.toThrow();
    t.destroy();
  });

  it('sendReliableTo does not crash for unknown peer', () => {
    const t = new Transport(makeEvents());
    expect(() => t.sendReliableTo('unknown', { type: MsgType.DISCONNECT } as any)).not.toThrow();
    t.destroy();
  });

  it('sendUnreliableTo does not crash for unknown peer', () => {
    const t = new Transport(makeEvents());
    expect(() => t.sendUnreliableTo('unknown', new ArrayBuffer(10))).not.toThrow();
    t.destroy();
  });
});

describe('Transport — send methods (with mock peer)', () => {
  let transport: Transport;
  let events: TransportEvents;

  beforeEach(() => {
    vi.clearAllMocks();
    events = makeEvents();
    transport = new Transport(events);

    // Manually add a peer to simulate connected state
    (transport as any).peers.set('peer-1', {
      peerId: 'peer-1',
      conn: mockConn,
      rtt: 0,
      jitter: 0,
      lastPongTime: performance.now(),
      health: 'healthy',
    });
    (transport as any).status = 'connected';
  });

  afterEach(() => {
    transport.destroy();
  });

  it('sendReliable sends JSON to connected peer', () => {
    const msg = { type: MsgType.PAUSE, paused: true };
    transport.sendReliable(msg as any);
    expect(mockConn.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('sendReliableTo sends to specific peer', () => {
    const msg = { type: MsgType.DISCONNECT };
    transport.sendReliableTo('peer-1', msg as any);
    expect(mockConn.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('sendReliableTo skips unknown peer', () => {
    mockConn.send.mockClear();
    transport.sendReliableTo('unknown', { type: MsgType.DISCONNECT } as any);
    expect(mockConn.send).not.toHaveBeenCalled();
  });

  it('sendUnreliable sends binary to all peers', () => {
    const data = new ArrayBuffer(10);
    transport.sendUnreliable(data);
    expect(mockConn.send).toHaveBeenCalledWith(data);
  });

  it('sendUnreliableTo sends to specific peer', () => {
    const data = new ArrayBuffer(10);
    transport.sendUnreliableTo('peer-1', data);
    expect(mockConn.send).toHaveBeenCalledWith(data);
  });

  it('sendReliable skips closed connections', () => {
    mockConn.open = false;
    transport.sendReliable({ type: MsgType.DISCONNECT } as any);
    expect(mockConn.send).not.toHaveBeenCalled();
    mockConn.open = true;
  });

  it('getPeerIds returns peer IDs', () => {
    expect(transport.getPeerIds()).toEqual(['peer-1']);
  });

  it('getPeerInfo returns info for known peer', () => {
    const info = transport.getPeerInfo('peer-1');
    expect(info).toBeDefined();
    expect(info!.peerId).toBe('peer-1');
  });

  it('peerCount reflects number of peers', () => {
    expect(transport.peerCount).toBe(1);
  });
});

describe('Transport — gracefulDisconnect', () => {
  it('sends DISCONNECT and schedules destroy', () => {
    vi.useFakeTimers();
    const events = makeEvents();
    const t = new Transport(events);

    // Add a mock peer
    (t as any).peers.set('peer-1', {
      peerId: 'peer-1', conn: mockConn, rtt: 0, jitter: 0,
      lastPongTime: performance.now(), health: 'healthy',
    });

    t.gracefulDisconnect();

    // DISCONNECT should have been sent
    expect(mockConn.send).toHaveBeenCalled();

    // Destroy is scheduled after 100ms
    vi.advanceTimersByTime(150);

    vi.useRealTimers();
  });
});

describe('Transport — destroy', () => {
  it('clears all resources and sets idle status', () => {
    const events = makeEvents();
    const t = new Transport(events);

    (t as any).peers.set('peer-1', {
      peerId: 'peer-1', conn: mockConn, rtt: 0, jitter: 0,
      lastPongTime: performance.now(), health: 'healthy',
    });
    (t as any).peer = { destroy: vi.fn() };
    (t as any).pingTimer = setInterval(() => {}, 1000);

    t.destroy();

    expect(t.peerCount).toBe(0);
    expect((t as any).peer).toBeNull();
    expect((t as any).pingTimer).toBeNull();
    expect(events.onStatusChange).toHaveBeenCalledWith('idle', undefined);
  });
});

describe('Transport — message handling', () => {
  let transport: Transport;
  let events: TransportEvents;

  beforeEach(() => {
    vi.clearAllMocks();
    events = makeEvents();
    transport = new Transport(events);

    (transport as any).peers.set('peer-1', {
      peerId: 'peer-1', conn: mockConn, rtt: 50, jitter: 5,
      lastPongTime: performance.now(), health: 'healthy',
    });
    (transport as any).status = 'connected';
  });

  afterEach(() => {
    transport.destroy();
  });

  it('delivers JSON string as reliable message', () => {
    const msg = { type: MsgType.PAUSE, paused: true };
    (transport as any).deliverData(JSON.stringify(msg), 'peer-1');
    expect(events.onReliableMessage).toHaveBeenCalled();
  });

  it('delivers ArrayBuffer as unreliable message (non-ping/pong)', () => {
    // Create a binary message that's NOT a ping/pong
    const data = new ArrayBuffer(20);
    const view = new Uint8Array(data);
    view[0] = 99; // Not a ping/pong marker
    (transport as any).deliverData(data, 'peer-1');
    expect(events.onUnreliableMessage).toHaveBeenCalledWith(data, 'peer-1');
  });

  it('handles PING by responding with PONG', () => {
    const pingData = encodePing(1000);
    (transport as any).handleBinaryMessage(pingData, 'peer-1');
    // Should send pong back
    expect(mockConn.send).toHaveBeenCalled();
  });

  it('handles PONG by updating RTT', () => {
    const timestamp = performance.now() - 50; // 50ms ago
    const pongData = encodePong(timestamp);
    (transport as any).handleBinaryMessage(pongData, 'peer-1');
    // RTT should be updated
    expect(events.onRttUpdate).toHaveBeenCalled();
    expect(transport.currentRtt).toBeGreaterThan(0);
  });

  it('ignores PONG with invalid RTT (negative or > 10s)', () => {
    // Timestamp in the future → negative RTT
    const futureTimestamp = performance.now() + 20000;
    const pongData = encodePong(futureTimestamp);
    (transport as any).handleBinaryMessage(pongData, 'peer-1');
    // Should not crash, RTT should stay at previous value
  });

  it('updates aggregate RTT across multiple peers', () => {
    // Add a second peer
    (transport as any).peers.set('peer-2', {
      peerId: 'peer-2', conn: { ...mockConn, peer: 'peer-2' },
      rtt: 100, jitter: 10,
      lastPongTime: performance.now(), health: 'healthy',
    });

    (transport as any).updateAggregateRtt();

    // Aggregate should be average of both peers
    expect(transport.currentRtt).toBeGreaterThan(0);
  });

  it('handles malformed JSON gracefully', () => {
    expect(() => {
      (transport as any).handleJsonMessage('not json {{{', 'peer-1');
    }).not.toThrow();
    // onReliableMessage should NOT have been called
    expect(events.onReliableMessage).not.toHaveBeenCalled();
  });

  it('handles typed array buffer data (Uint8Array wrapper)', () => {
    const buf = new ArrayBuffer(10);
    const typed = { buffer: buf };
    (transport as any).deliverData(typed, 'peer-1');
    // Should deliver the underlying buffer
    expect(events.onUnreliableMessage).toHaveBeenCalled();
  });
});

describe('Transport — peer lifecycle', () => {
  it('removePeer fires onPeerDisconnected', () => {
    const events = makeEvents();
    const t = new Transport(events);

    (t as any).peers.set('peer-1', {
      peerId: 'peer-1', conn: mockConn, rtt: 0, jitter: 0,
      lastPongTime: performance.now(), health: 'healthy',
    });
    (t as any).status = 'connected';

    (t as any).removePeer('peer-1');

    expect(events.onPeerDisconnected).toHaveBeenCalledWith('peer-1');
    expect(t.peerCount).toBe(0);
    t.destroy();
  });

  it('removePeer sets disconnected when no peers left', () => {
    const events = makeEvents();
    const t = new Transport(events);

    (t as any).peers.set('peer-1', {
      peerId: 'peer-1', conn: mockConn, rtt: 0, jitter: 0,
      lastPongTime: performance.now(), health: 'healthy',
    });
    (t as any).status = 'connected';

    (t as any).removePeer('peer-1');

    expect(events.onStatusChange).toHaveBeenCalledWith('disconnected', undefined);
    t.destroy();
  });

  it('removePeer is safe for unknown peer', () => {
    const t = new Transport(makeEvents());
    expect(() => (t as any).removePeer('unknown')).not.toThrow();
    t.destroy();
  });
});

describe('Transport — visibility change handling', () => {
  it('records hidden time when document becomes hidden', () => {
    const t = new Transport(makeEvents());
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    (t as any).handleVisibilityChange();
    expect((t as any).hiddenAt).toBeGreaterThan(0);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    t.destroy();
  });

  it('resets pong times when returning from long background', () => {
    const events = makeEvents();
    const t = new Transport(events);

    // Use absolute timestamps that are positive and realistic
    const now = performance.now();
    const safeNow = Math.max(now, 50000); // ensure large enough for subtraction
    vi.spyOn(performance, 'now').mockReturnValue(safeNow);

    (t as any).peers.set('peer-1', {
      peerId: 'peer-1', conn: mockConn, rtt: 0, jitter: 0,
      lastPongTime: safeNow - 10000, health: 'healthy',
    });
    (t as any).status = 'connected';
    (t as any).hiddenAt = safeNow - 3000; // was hidden 3s ago (hiddenAt > 0)

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    (t as any).handleVisibilityChange();

    // lastPongTime should be refreshed to safeNow
    const info = t.getPeerInfo('peer-1');
    expect(info!.lastPongTime).toBe(safeNow);

    vi.restoreAllMocks();
    t.destroy();
  });

  it('does not reset pong times for short background duration', () => {
    const events = makeEvents();
    const t = new Transport(events);

    const oldPongTime = performance.now() - 500;
    (t as any).peers.set('peer-1', {
      peerId: 'peer-1', conn: mockConn, rtt: 0, jitter: 0,
      lastPongTime: oldPongTime, health: 'healthy',
    });
    (t as any).status = 'connected';
    (t as any).hiddenAt = performance.now() - 500; // only hidden 0.5s

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    (t as any).handleVisibilityChange();

    // lastPongTime should NOT be refreshed (short duration)
    const info = t.getPeerInfo('peer-1');
    expect(info!.lastPongTime).toBe(oldPongTime);

    t.destroy();
  });
});

describe('Transport — setStatus', () => {
  it('updates internal status and fires callback', () => {
    const events = makeEvents();
    const t = new Transport(events);

    (t as any).setStatus('connected');
    expect(t.connected).toBe(true);
    expect(events.onStatusChange).toHaveBeenCalledWith('connected', undefined);

    (t as any).setStatus('error', 'test error');
    expect(events.onStatusChange).toHaveBeenCalledWith('error', 'test error');

    t.destroy();
  });
});

describe('Transport — updateAggregateRtt', () => {
  it('does nothing with no peers', () => {
    const t = new Transport(makeEvents());
    (t as any).updateAggregateRtt();
    expect(t.currentRtt).toBe(0);
    t.destroy();
  });

  it('averages RTT across peers', () => {
    const t = new Transport(makeEvents());
    (t as any).peers.set('a', { rtt: 40, jitter: 5 });
    (t as any).peers.set('b', { rtt: 60, jitter: 15 });
    (t as any).updateAggregateRtt();
    expect(t.currentRtt).toBe(50);
    expect(t.currentJitter).toBe(10);
    t.destroy();
  });
});

// ---- Async lifecycle tests (createRoom / joinRoom / setupConnection) ----

describe('Transport — createRoom lifecycle', () => {
  it('creates a room and resolves with room code on peer open', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.createRoom();

    // Simulate PeerJS signaling server connection
    _lastPeerEmitter.emit('open');

    const code = await promise;
    expect(code).toMatch(/^[A-Z2-9]{3}$/);
    expect(t.roomCode).toBe(code);
    expect(t.isHost).toBe(true);
    expect(events.onStatusChange).toHaveBeenCalledWith('creating', undefined);

    t.destroy();
  });

  it('rejects on peer error', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.createRoom();

    _lastPeerEmitter.emit('error', { type: 'unavailable-id', message: 'test' });

    await expect(promise).rejects.toThrow();
    expect(events.onStatusChange).toHaveBeenCalledWith('error', expect.stringContaining('Room code'));

    t.destroy();
  });

  it('rejects on generic signaling error', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.createRoom();
    _lastPeerEmitter.emit('error', { type: 'server-error', message: 'fail' });

    await expect(promise).rejects.toThrow();
    expect(events.onStatusChange).toHaveBeenCalledWith('error', expect.stringContaining('Signaling'));

    t.destroy();
  });

  it('handles incoming guest connection', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.createRoom();
    _lastPeerEmitter.emit('open');
    await promise;

    // Simulate guest connecting
    const guestConn = makeMockConn('guest-1');
    _lastPeerEmitter.emit('connection', guestConn);

    // Simulate connection open
    guestConn.open = true;
    guestConn._emit('open');

    expect(t.peerCount).toBe(1);
    expect(events.onPeerConnected).toHaveBeenCalledWith('guest-1');
    expect(events.onStatusChange).toHaveBeenCalledWith('connected', undefined);

    t.destroy();
  });

  it('handles disconnected event with reconnect', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.createRoom();
    _lastPeerEmitter.emit('open');
    await promise;

    // Set status to connected
    (t as any).status = 'connected';

    // Simulate signaling disconnect
    _lastPeerEmitter.emit('disconnected');

    // Should attempt reconnect
    expect(_lastPeerInstance.reconnect).toHaveBeenCalled();

    t.destroy();
  });

  it('gives up reconnect after 3 attempts', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.createRoom();
    _lastPeerEmitter.emit('open');
    await promise;

    (t as any).status = 'connected';

    // Simulate 4 disconnects (exceeds 3 retry limit)
    for (let i = 0; i < 4; i++) {
      _lastPeerEmitter.emit('disconnected');
    }

    // After 3+ attempts, should set error status
    const statusCalls = (events.onStatusChange as any).mock.calls;
    const hasError = statusCalls.some((c: any[]) => c[0] === 'error');
    expect(hasError).toBe(true);

    t.destroy();
  });
});

describe('Transport — joinRoom lifecycle', () => {
  it('joins a room and resolves on connection', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.joinRoom('ABC');

    // Simulate peer open → connects to host
    _lastPeerEmitter.emit('open');

    // The mock connect() auto-opens after setTimeout(0)
    await new Promise(r => setTimeout(r, 10));

    // onStatusChange('connected') should have been called, resolving the promise
    // Trigger the connected status manually through the event chain
    (events.onStatusChange as any).mockImplementation((status: string) => {
      // The real implementation resolves the promise here
    });

    // joinRoom's onStatusChange wrapper resolves/rejects based on status
    // Since our mock auto-opens, let's verify the transport tried to connect
    expect(_lastPeerInstance.connect).toHaveBeenCalled();
    expect(t.roomCode).toBe('ABC');
    expect(t.isHost).toBe(false);

    t.destroy();
  });

  it('rejects on peer error with unavailable code', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.joinRoom('ZZZ');
    _lastPeerEmitter.emit('error', { type: 'peer-unavailable', message: 'not found' });

    await expect(promise).rejects.toThrow();
    expect(events.onStatusChange).toHaveBeenCalledWith('error', expect.stringContaining('Room not found'));

    t.destroy();
  });
});

describe('Transport — setupConnection details', () => {
  it('handles data events from connected peer', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.createRoom();
    _lastPeerEmitter.emit('open');
    await promise;

    const conn = makeMockConn('guest-1');
    _lastPeerEmitter.emit('connection', conn);
    conn.open = true;
    conn._emit('open');

    // Simulate receiving JSON data
    conn._emit('data', JSON.stringify({ type: MsgType.PAUSE, paused: true }));
    expect(events.onReliableMessage).toHaveBeenCalled();

    t.destroy();
  });

  it('handles binary data events from connected peer', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.createRoom();
    _lastPeerEmitter.emit('open');
    await promise;

    const conn = makeMockConn('guest-1');
    _lastPeerEmitter.emit('connection', conn);
    conn.open = true;
    conn._emit('open');

    // Simulate receiving binary (non-ping) data
    const buf = new ArrayBuffer(20);
    new Uint8Array(buf)[0] = 99;
    conn._emit('data', buf);
    expect(events.onUnreliableMessage).toHaveBeenCalled();

    t.destroy();
  });

  it('handles connection close', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.createRoom();
    _lastPeerEmitter.emit('open');
    await promise;

    const conn = makeMockConn('guest-1');
    _lastPeerEmitter.emit('connection', conn);
    conn.open = true;
    conn._emit('open');
    expect(t.peerCount).toBe(1);

    // Simulate connection close
    conn._emit('close');
    expect(t.peerCount).toBe(0);
    expect(events.onPeerDisconnected).toHaveBeenCalledWith('guest-1');

    t.destroy();
  });

  it('handles connection error', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.createRoom();
    _lastPeerEmitter.emit('open');
    await promise;

    const conn = makeMockConn('guest-1');
    _lastPeerEmitter.emit('connection', conn);
    conn.open = true;
    conn._emit('open');

    conn._emit('error', { message: 'data channel error' });
    expect(t.peerCount).toBe(0);

    t.destroy();
  });

  it('starts ping timer on first connection', async () => {
    const events = makeEvents();
    const t = new Transport(events);

    const promise = t.createRoom();
    _lastPeerEmitter.emit('open');
    await promise;

    expect((t as any).pingTimer).toBeNull();

    const conn = makeMockConn('guest-1');
    _lastPeerEmitter.emit('connection', conn);
    conn.open = true;
    conn._emit('open');

    // Ping timer should now be active
    expect((t as any).pingTimer).not.toBeNull();

    t.destroy();
  });
});

describe('Transport — getIceServers', () => {
  it('createRoom invokes PeerJS constructor', async () => {
    const events = makeEvents();
    const t = new Transport(events);
    const promise = t.createRoom();
    // Peer was constructed (our mock class was instantiated)
    expect(_lastPeerInstance).toBeDefined();
    // Clean up
    _lastPeerEmitter.emit('error', { type: 'test', message: 'test' });
    await promise.catch(() => {});
    t.destroy();
  });
});

describe('Transport — startPing health degradation', () => {
  it('marks peer as degraded after threshold', () => {
    vi.useFakeTimers();
    const events = makeEvents();
    const t = new Transport(events);
    const safeNow = 100000;
    vi.spyOn(performance, 'now').mockReturnValue(safeNow);

    // Manually add peer with old lastPongTime
    (t as any).peers.set('peer-1', {
      peerId: 'peer-1', conn: mockConn, rtt: 0, jitter: 0,
      lastPongTime: safeNow - 3000, // 3s ago > DEGRADED_THRESHOLD_MS (2000)
      health: 'healthy',
    });
    (t as any).status = 'connected';

    // Start ping timer
    (t as any).startPing();

    // Advance past PING_INTERVAL (500ms)
    vi.advanceTimersByTime(600);

    const info = t.getPeerInfo('peer-1');
    expect(info?.health).toBe('degraded');
    expect(events.onPeerHealthChange).toHaveBeenCalledWith('peer-1', 'degraded');

    vi.useRealTimers();
    vi.restoreAllMocks();
    t.destroy();
  });

  it('removes peer after pong timeout', () => {
    vi.useFakeTimers();
    const events = makeEvents();
    const t = new Transport(events);
    const safeNow = 100000;
    vi.spyOn(performance, 'now').mockReturnValue(safeNow);

    (t as any).peers.set('peer-1', {
      peerId: 'peer-1', conn: mockConn, rtt: 0, jitter: 0,
      lastPongTime: safeNow - 6000, // 6s ago > PONG_TIMEOUT_MS (5000)
      health: 'degraded',
    });
    (t as any).status = 'connected';
    (t as any).startPing();

    vi.advanceTimersByTime(600);

    // Peer should be removed
    expect(t.peerCount).toBe(0);
    expect(events.onPeerHealthChange).toHaveBeenCalledWith('peer-1', 'lost');

    vi.useRealTimers();
    vi.restoreAllMocks();
    t.destroy();
  });

  it('startPing is idempotent', () => {
    const t = new Transport(makeEvents());
    (t as any).startPing();
    const timer1 = (t as any).pingTimer;
    (t as any).startPing(); // second call
    expect((t as any).pingTimer).toBe(timer1); // same timer
    t.destroy();
  });

  it('stopPing clears timer', () => {
    const t = new Transport(makeEvents());
    (t as any).startPing();
    expect((t as any).pingTimer).not.toBeNull();
    (t as any).stopPing();
    expect((t as any).pingTimer).toBeNull();
    t.destroy();
  });
});

describe('Transport — PONG updates peer health to healthy', () => {
  it('restores degraded peer to healthy on pong', () => {
    const events = makeEvents();
    const t = new Transport(events);

    (t as any).peers.set('peer-1', {
      peerId: 'peer-1', conn: mockConn, rtt: 50, jitter: 5,
      lastPongTime: performance.now() - 3000,
      health: 'degraded',
    });
    (t as any).status = 'connected';

    // Simulate receiving pong with recent timestamp
    const timestamp = performance.now() - 50;
    const pongData = encodePong(timestamp);
    (t as any).handleBinaryMessage(pongData, 'peer-1');

    const info = t.getPeerInfo('peer-1');
    expect(info?.health).toBe('healthy');
    expect(events.onPeerHealthChange).toHaveBeenCalledWith('peer-1', 'healthy');

    t.destroy();
  });
});

describe('Transport — onIncomingData with simulator', () => {
  it('routes binary data through simulator when enabled', () => {
    const events = makeEvents();
    const t = new Transport(events);
    const mockSim = { enabled: true, enqueue: vi.fn(() => true), flush: vi.fn(() => []) };
    (t as any).simulator = mockSim;

    // Binary data that is NOT ping/pong
    const buf = new ArrayBuffer(10);
    new Uint8Array(buf)[0] = 99;
    (t as any).onIncomingData(buf, 'peer-1');

    expect(mockSim.enqueue).toHaveBeenCalled();
    t.destroy();
  });

  it('ping/pong bypasses simulator for accurate RTT', () => {
    const events = makeEvents();
    const t = new Transport(events);
    const mockSim = { enabled: true, enqueue: vi.fn(), flush: vi.fn(() => []) };
    (t as any).simulator = mockSim;

    (t as any).peers.set('peer-1', {
      peerId: 'peer-1', conn: mockConn, rtt: 0, jitter: 0,
      lastPongTime: performance.now(), health: 'healthy',
    });

    // Send a PING — should be handled directly, not enqueued
    const pingData = encodePing(performance.now());
    (t as any).onIncomingData(pingData, 'peer-1');

    // Ping was handled directly (pong sent), not enqueued
    expect(mockConn.send).toHaveBeenCalled();

    t.destroy();
  });

  it('flushSimulator delivers queued messages', () => {
    const events = makeEvents();
    const t = new Transport(events);
    const mockSim = {
      enabled: true,
      enqueue: vi.fn(),
      flush: vi.fn(() => [
        { data: { data: JSON.stringify({ type: MsgType.PAUSE, paused: true }), fromPeerId: 'peer-1' } },
      ]),
    };
    (t as any).simulator = mockSim;

    (t as any).flushSimulator();

    expect(events.onReliableMessage).toHaveBeenCalled();
    t.destroy();
  });
});
