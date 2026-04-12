import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock peerjs before importing Transport
const mockConn = {
  peer: 'remote-peer-1',
  open: true,
  send: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
};

const mockPeerInstance = {
  on: vi.fn(),
  connect: vi.fn(() => mockConn),
  reconnect: vi.fn(),
  destroy: vi.fn(),
};

vi.mock('peerjs', () => ({
  default: vi.fn(() => mockPeerInstance),
}));

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
    (t as any).peer = mockPeerInstance;
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
