import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mock Trystero ----

const mockSendBinary = vi.fn(async () => []);
const mockSendJson = vi.fn(async () => []);
let onBinaryCallback: ((data: ArrayBuffer, peerId: string) => void) | null = null;
let onJsonCallback: ((data: string, peerId: string) => void) | null = null;
let onPeerJoinCallback: ((peerId: string) => void) | null = null;
let onPeerLeaveCallback: ((peerId: string) => void) | null = null;

const mockRoom = {
  makeAction: vi.fn((namespace: string) => {
    if (namespace === 'bin') {
      return [
        mockSendBinary,
        (cb: (data: ArrayBuffer, peerId: string) => void) => { onBinaryCallback = cb; },
        vi.fn(),
      ];
    }
    return [
      mockSendJson,
      (cb: (data: string, peerId: string) => void) => { onJsonCallback = cb; },
      vi.fn(),
    ];
  }),
  onPeerJoin: vi.fn((fn: (id: string) => void) => { onPeerJoinCallback = fn; }),
  onPeerLeave: vi.fn((fn: (id: string) => void) => { onPeerLeaveCallback = fn; }),
  leave: vi.fn(async () => {}),
  getPeers: vi.fn(() => ({})),
  ping: vi.fn(async () => 0),
  addStream: vi.fn(() => []),
  removeStream: vi.fn(),
  addTrack: vi.fn(() => []),
  removeTrack: vi.fn(),
  replaceTrack: vi.fn(() => []),
  onPeerStream: vi.fn(),
  onPeerTrack: vi.fn(),
};

vi.mock('@trystero-p2p/mqtt', () => ({
  joinRoom: vi.fn(() => mockRoom),
  selfId: 'self-id',
}));

vi.mock('./core/networkSimulator', () => ({
  NetworkSimulator: vi.fn(() => ({ enabled: false, enqueue: vi.fn(), flush: vi.fn(() => []), getConfig: vi.fn(() => ({ latencyMs: 0, jitterMs: 0 })) })),
}));

import { Transport } from './transport';
import type { TransportEvents } from './transport';
import { MsgType, encodePing, encodePong } from './protocol';

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

function resetMocks() {
  vi.clearAllMocks();
  onBinaryCallback = null;
  onJsonCallback = null;
  onPeerJoinCallback = null;
  onPeerLeaveCallback = null;
}

// ---- Tests ----

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

describe('Transport — send methods (with connected peer)', () => {
  let transport: Transport;
  let events: TransportEvents;

  beforeEach(async () => {
    resetMocks();
    events = makeEvents();
    transport = new Transport(events);
    await transport.createRoom();
    // Simulate peer joining
    onPeerJoinCallback?.('guest-1');
  });

  afterEach(() => {
    transport.destroy();
  });

  it('sendReliable sends JSON via action sender', () => {
    const msg = { type: MsgType.PAUSE, paused: true };
    transport.sendReliable(msg as any);
    expect(mockSendJson).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('sendReliableTo sends to specific peer', () => {
    const msg = { type: MsgType.DISCONNECT };
    transport.sendReliableTo('guest-1', msg as any);
    expect(mockSendJson).toHaveBeenCalledWith(JSON.stringify(msg), 'guest-1');
  });

  it('sendUnreliable sends binary via action sender', () => {
    const data = new ArrayBuffer(10);
    transport.sendUnreliable(data);
    expect(mockSendBinary).toHaveBeenCalledWith(data);
  });

  it('sendUnreliableTo sends binary to specific peer', () => {
    const data = new ArrayBuffer(10);
    transport.sendUnreliableTo('guest-1', data);
    expect(mockSendBinary).toHaveBeenCalledWith(data, 'guest-1');
  });

  it('getPeerIds returns peer IDs', () => {
    expect(transport.getPeerIds()).toEqual(['guest-1']);
  });

  it('getPeerInfo returns info for known peer', () => {
    const info = transport.getPeerInfo('guest-1');
    expect(info).toBeDefined();
    expect(info!.peerId).toBe('guest-1');
  });

  it('peerCount reflects number of peers', () => {
    expect(transport.peerCount).toBe(1);
  });
});

describe('Transport — gracefulDisconnect', () => {
  it('sends DISCONNECT and schedules destroy', async () => {
    vi.useFakeTimers();
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    await t.createRoom();
    onPeerJoinCallback?.('guest-1');

    t.gracefulDisconnect();
    expect(mockSendJson).toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    vi.useRealTimers();
  });
});

describe('Transport — destroy', () => {
  it('clears all resources and sets idle status', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    await t.createRoom();
    onPeerJoinCallback?.('guest-1');

    t.destroy();

    expect(t.peerCount).toBe(0);
    expect(events.onStatusChange).toHaveBeenCalledWith('idle', undefined);
    expect(mockRoom.leave).toHaveBeenCalled();
  });
});

describe('Transport — message handling', () => {
  let transport: Transport;
  let events: TransportEvents;

  beforeEach(async () => {
    resetMocks();
    events = makeEvents();
    transport = new Transport(events);
    await transport.createRoom();
    onPeerJoinCallback?.('guest-1');
  });

  afterEach(() => {
    transport.destroy();
  });

  it('delivers JSON string as reliable message', () => {
    const msg = { type: MsgType.PAUSE, paused: true };
    onJsonCallback?.(JSON.stringify(msg), 'guest-1');
    expect(events.onReliableMessage).toHaveBeenCalled();
  });

  it('delivers ArrayBuffer as unreliable message (non-ping/pong)', () => {
    const data = new ArrayBuffer(20);
    new Uint8Array(data)[0] = 99;
    onBinaryCallback?.(data, 'guest-1');
    expect(events.onUnreliableMessage).toHaveBeenCalledWith(data, 'guest-1');
  });

  it('handles PING by responding with PONG', () => {
    const pingData = encodePing(1000);
    onBinaryCallback?.(pingData, 'guest-1');
    expect(mockSendBinary).toHaveBeenCalled();
  });

  it('handles PONG by updating RTT', () => {
    const timestamp = performance.now() - 50;
    const pongData = encodePong(timestamp);
    onBinaryCallback?.(pongData, 'guest-1');
    expect(events.onRttUpdate).toHaveBeenCalled();
    expect(transport.currentRtt).toBeGreaterThan(0);
  });

  it('ignores PONG with invalid RTT (negative or > 10s)', () => {
    const futureTimestamp = performance.now() + 20000;
    const pongData = encodePong(futureTimestamp);
    onBinaryCallback?.(pongData, 'guest-1');
    // Should not crash
  });

  it('handles malformed JSON gracefully', () => {
    expect(() => {
      (transport as any).handleJsonMessage('not json {{{', 'guest-1');
    }).not.toThrow();
    expect(events.onReliableMessage).not.toHaveBeenCalled();
  });

  it('updates aggregate RTT across multiple peers', () => {
    (transport as any).peers.set('guest-2', {
      peerId: 'guest-2', rtt: 100, jitter: 10,
      lastPongTime: performance.now(), health: 'healthy',
    });
    (transport as any).updateAggregateRtt();
    expect(transport.currentRtt).toBeGreaterThan(0);
  });
});

describe('Transport — createRoom lifecycle', () => {
  it('creates a room and resolves with room code', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);

    const code = await t.createRoom();

    expect(code).toMatch(/^[A-Z2-9]{3}$/);
    expect(t.roomCode).toBe(code);
    expect(t.isHost).toBe(true);
    expect(events.onStatusChange).toHaveBeenCalledWith('creating', undefined);

    t.destroy();
  });

  it('handles incoming guest connection', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    await t.createRoom();

    onPeerJoinCallback?.('guest-1');

    expect(t.peerCount).toBe(1);
    expect(events.onPeerConnected).toHaveBeenCalledWith('guest-1');
    expect(events.onStatusChange).toHaveBeenCalledWith('connected', undefined);

    t.destroy();
  });
});

describe('Transport — cleanup on joinRoom reuse', () => {
  it('leaves the prior room before joining a new one', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);

    const firstJoin = t.joinRoom('ABC');
    onPeerJoinCallback?.('host-peer-1');
    await firstJoin;
    expect(t.peerCount).toBe(1);

    // Second joinRoom should leave() the old room + clear peers
    mockRoom.leave.mockClear();
    const secondJoin = t.joinRoom('XYZ');
    expect(mockRoom.leave).toHaveBeenCalled();
    expect(t.peerCount).toBe(0);

    onPeerJoinCallback?.('host-peer-2');
    await secondJoin;
    t.destroy();
  });
});

describe('Transport — joinRoom lifecycle', () => {
  it('joins a room and sets roomCode', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);

    // Start join — won't resolve until peer connects
    const joinPromise = t.joinRoom('ABC');

    expect(t.roomCode).toBe('ABC');
    expect(t.isHost).toBe(false);
    expect(events.onStatusChange).toHaveBeenCalledWith('joining', undefined);

    // Simulate host connecting
    onPeerJoinCallback?.('host-peer');

    await joinPromise;

    expect(t.peerCount).toBe(1);
    t.destroy();
  });
});

describe('Transport — peer lifecycle', () => {
  it('removePeer fires onPeerDisconnected', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    await t.createRoom();
    onPeerJoinCallback?.('guest-1');

    (t as any).removePeer('guest-1');

    expect(events.onPeerDisconnected).toHaveBeenCalledWith('guest-1');
    expect(t.peerCount).toBe(0);
    t.destroy();
  });

  it('removePeer sets disconnected when no peers left', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    await t.createRoom();
    onPeerJoinCallback?.('guest-1');

    (t as any).removePeer('guest-1');

    expect(events.onStatusChange).toHaveBeenCalledWith('disconnected', undefined);
    t.destroy();
  });

  it('removePeer is safe for unknown peer', () => {
    const t = new Transport(makeEvents());
    expect(() => (t as any).removePeer('unknown')).not.toThrow();
    t.destroy();
  });

  it('onPeerLeave triggers removePeer', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    await t.createRoom();
    onPeerJoinCallback?.('guest-1');
    expect(t.peerCount).toBe(1);

    onPeerLeaveCallback?.('guest-1');
    expect(t.peerCount).toBe(0);
    expect(events.onPeerDisconnected).toHaveBeenCalledWith('guest-1');

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

  it('resets pong times when returning from long background', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    await t.createRoom();
    onPeerJoinCallback?.('guest-1');

    const now = performance.now();
    const safeNow = Math.max(now, 50000);
    vi.spyOn(performance, 'now').mockReturnValue(safeNow);

    const info = t.getPeerInfo('guest-1')!;
    info.lastPongTime = safeNow - 10000;
    (t as any).hiddenAt = safeNow - 3000;

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    (t as any).handleVisibilityChange();

    expect(info.lastPongTime).toBe(safeNow);

    vi.restoreAllMocks();
    t.destroy();
  });

  it('does not reset pong times for short background duration', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    await t.createRoom();
    onPeerJoinCallback?.('guest-1');

    const oldPongTime = performance.now() - 500;
    const info = t.getPeerInfo('guest-1')!;
    info.lastPongTime = oldPongTime;
    (t as any).hiddenAt = performance.now() - 500;

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    (t as any).handleVisibilityChange();

    expect(info.lastPongTime).toBe(oldPongTime);
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
    (t as any).peers.set('a', { rtt: 40, jitter: 5, lastPongTime: 0, health: 'healthy', peerId: 'a' });
    (t as any).peers.set('b', { rtt: 60, jitter: 15, lastPongTime: 0, health: 'healthy', peerId: 'b' });
    (t as any).updateAggregateRtt();
    expect(t.currentRtt).toBe(50);
    expect(t.currentJitter).toBe(10);
    t.destroy();
  });
});

describe('Transport — startPing health degradation', () => {
  it('marks peer as degraded after threshold', async () => {
    vi.useFakeTimers();
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    await t.createRoom();

    const safeNow = 100000;
    vi.spyOn(performance, 'now').mockReturnValue(safeNow);

    (t as any).peers.set('peer-1', {
      peerId: 'peer-1', rtt: 0, jitter: 0,
      lastPongTime: safeNow - 5000, health: 'healthy',
    });
    (t as any).status = 'connected';
    (t as any).startPing();

    vi.advanceTimersByTime(600);

    const info = t.getPeerInfo('peer-1');
    expect(info?.health).toBe('degraded');
    expect(events.onPeerHealthChange).toHaveBeenCalledWith('peer-1', 'degraded');

    vi.useRealTimers();
    vi.restoreAllMocks();
    t.destroy();
  });

  it('removes peer after pong timeout', async () => {
    vi.useFakeTimers();
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    await t.createRoom();

    const safeNow = 100000;
    vi.spyOn(performance, 'now').mockReturnValue(safeNow);

    (t as any).peers.set('peer-1', {
      peerId: 'peer-1', rtt: 0, jitter: 0,
      lastPongTime: safeNow - 11000, health: 'degraded',
    });
    (t as any).status = 'connected';
    (t as any).startPing();

    vi.advanceTimersByTime(600);

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
    (t as any).startPing();
    expect((t as any).pingTimer).toBe(timer1);
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
  it('restores degraded peer to healthy on pong', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    await t.createRoom();
    onPeerJoinCallback?.('guest-1');

    const info = t.getPeerInfo('guest-1')!;
    info.health = 'degraded';
    info.rtt = 50;
    info.lastPongTime = performance.now() - 3000;

    const timestamp = performance.now() - 50;
    const pongData = encodePong(timestamp);
    (t as any).handleBinaryMessage(pongData, 'guest-1');

    expect(info.health).toBe('healthy');
    expect(events.onPeerHealthChange).toHaveBeenCalledWith('guest-1', 'healthy');

    t.destroy();
  });
});

describe('Transport — onIncomingData with simulator', () => {
  it('routes binary data through simulator when enabled', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    const mockSim = { enabled: true, enqueue: vi.fn(() => true), flush: vi.fn(() => []), getConfig: vi.fn(() => ({ latencyMs: 0, jitterMs: 0 })) };
    (t as any).simulator = mockSim;

    const buf = new ArrayBuffer(10);
    new Uint8Array(buf)[0] = 99;
    (t as any).onIncomingData(buf, 'peer-1', true);

    expect(mockSim.enqueue).toHaveBeenCalled();
    t.destroy();
  });

  it('ping/pong bypasses simulator for accurate RTT', async () => {
    resetMocks();
    const events = makeEvents();
    const t = new Transport(events);
    await t.createRoom();
    onPeerJoinCallback?.('guest-1');

    const mockSim = { enabled: true, enqueue: vi.fn(), flush: vi.fn(() => []), getConfig: vi.fn(() => ({ latencyMs: 0, jitterMs: 0 })) };
    (t as any).simulator = mockSim;

    const pingData = encodePing(performance.now());
    (t as any).onIncomingData(pingData, 'guest-1', true);

    // Ping was handled directly (pong sent), not enqueued
    expect(mockSendBinary).toHaveBeenCalled();

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
      getConfig: vi.fn(() => ({ latencyMs: 0, jitterMs: 0 })),
    };
    (t as any).simulator = mockSim;

    (t as any).flushSimulator();

    expect(events.onReliableMessage).toHaveBeenCalled();
    t.destroy();
  });
});
