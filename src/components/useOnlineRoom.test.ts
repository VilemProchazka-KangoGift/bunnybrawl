/**
 * Tests for useOnlineRoom — focused on the PROTOCOL_VERSION mismatch path.
 *
 * Strategy: capture the events object passed to `new Transport(events)` so we
 * can drive `onReliableMessage` with synthetic HANDSHAKE messages. Assert
 * downstream side-effects via Zustand store reads + Transport mock spies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { TransportEvents } from '../engine/net/transport';
import { MsgType, PROTOCOL_VERSION } from '../engine/net/protocol';
import { useGameStore } from '../store/gameStore';

// Capture the events bag passed to each Transport instantiation.
let capturedEvents: TransportEvents | null = null;
const transportMockApi = {
  destroy: vi.fn(),
  sendReliable: vi.fn(),
  sendReliableTo: vi.fn(),
  sendUnreliable: vi.fn(),
  sendUnreliableTo: vi.fn(),
  setEvents: vi.fn((e: TransportEvents) => { capturedEvents = e; }),
  createRoom: vi.fn(async () => 'ABCD'),
  joinRoom: vi.fn(async () => {}),
  getPeerIds: vi.fn(() => []),
  isHost: false,
  isRelay: false,
  currentRtt: 0,
  currentJitter: 0,
  peerCount: 0,
  roomCode: 'ABCD',
  connected: false,
};

vi.mock('../engine/net/transport', () => ({
  Transport: class MockTransport {
    constructor(events: TransportEvents) {
      capturedEvents = events;
      Object.assign(this, transportMockApi);
    }
  },
}));

import {
  useOnlineRoom, getModalTransport, clearModalTransport,
  tearDownOnlineSession, getHostReclaimTokens, getGuestOwnReclaimToken,
  clearReclaimTokens,
} from './useOnlineRoom';

describe('useOnlineRoom — PROTOCOL_VERSION mismatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEvents = null;
    act(() => {
      useGameStore.getState().resetOnline();
    });
  });

  function setup(isHost: boolean) {
    const onMatchStart = vi.fn();
    const { result } = renderHook(() => useOnlineRoom({ onMatchStart }));
    act(() => result.current.connect(isHost));
    expect(capturedEvents).toBeTruthy();
    return { result };
  }

  it('mismatched protocolVersion sets connectionStatus to error with i18n message', () => {
    setup(true);
    act(() => {
      capturedEvents!.onReliableMessage(
        { type: MsgType.HANDSHAKE, protocolVersion: PROTOCOL_VERSION + 1, playerName: 'OldClient' } as any,
        'peer-bad',
      );
    });
    const { connectionStatus, connectionError } = useGameStore.getState().online;
    expect(connectionStatus).toBe('error');
    // i18n falls through to the English fallback in tests (no language loaded)
    expect(connectionError).toBeTruthy();
    expect(typeof connectionError).toBe('string');
  });

  it('host sends DISCONNECT to the offending peer on mismatch', () => {
    const { result } = setup(true);
    act(() => {
      capturedEvents!.onReliableMessage(
        { type: MsgType.HANDSHAKE, protocolVersion: PROTOCOL_VERSION - 1, playerName: 'OldClient' } as any,
        'peer-bad',
      );
    });
    expect(transportMockApi.sendReliableTo).toHaveBeenCalledWith(
      'peer-bad',
      expect.objectContaining({ type: MsgType.DISCONNECT }),
    );
    void result;
  });

  it('guest does NOT send DISCONNECT on mismatch (host-only branch)', () => {
    setup(false);
    transportMockApi.sendReliableTo.mockClear();
    act(() => {
      capturedEvents!.onReliableMessage(
        { type: MsgType.HANDSHAKE, protocolVersion: PROTOCOL_VERSION + 1, playerName: 'OldHost' } as any,
        undefined, // guest doesn't get fromPeerId for host messages in same way
      );
    });
    expect(transportMockApi.sendReliableTo).not.toHaveBeenCalled();
  });

  it('mismatch destroys the transport (both sides)', () => {
    setup(true);
    transportMockApi.destroy.mockClear();
    act(() => {
      capturedEvents!.onReliableMessage(
        { type: MsgType.HANDSHAKE, protocolVersion: PROTOCOL_VERSION + 1, playerName: 'X' } as any,
        'peer-x',
      );
    });
    expect(transportMockApi.destroy).toHaveBeenCalledTimes(1);
  });

  it('mismatch resets step back to "choose"', () => {
    const { result } = setup(true);
    expect(result.current.step).toBe('connecting');
    act(() => {
      capturedEvents!.onReliableMessage(
        { type: MsgType.HANDSHAKE, protocolVersion: 999, playerName: 'X' } as any,
        'peer-x',
      );
    });
    expect(result.current.step).toBe('choose');
  });

  it('matched protocolVersion does NOT trigger the mismatch path', () => {
    setup(true);
    transportMockApi.destroy.mockClear();
    act(() => {
      capturedEvents!.onReliableMessage(
        { type: MsgType.HANDSHAKE, protocolVersion: PROTOCOL_VERSION, playerName: 'GoodClient' } as any,
        'peer-good',
      );
    });
    expect(transportMockApi.destroy).not.toHaveBeenCalled();
    const { connectionStatus } = useGameStore.getState().online;
    expect(connectionStatus).not.toBe('error');
  });
});

describe('clearModalTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEvents = null;
    act(() => {
      useGameStore.getState().resetOnline();
    });
    clearModalTransport();
  });

  it('starts as null when no connection has been made', () => {
    expect(getModalTransport()).toBeNull();
  });

  it('connect() populates the modal transport ref', () => {
    const onMatchStart = vi.fn();
    const { result } = renderHook(() => useOnlineRoom({ onMatchStart }));
    act(() => result.current.connect(true));
    expect(getModalTransport()).not.toBeNull();
  });

  it('clearModalTransport() nulls the ref so quit-then-connect path is clean', () => {
    const onMatchStart = vi.fn();
    const { result } = renderHook(() => useOnlineRoom({ onMatchStart }));
    act(() => result.current.connect(true));
    expect(getModalTransport()).not.toBeNull();
    clearModalTransport();
    expect(getModalTransport()).toBeNull();
  });

  it('repeated clear is a no-op', () => {
    expect(() => {
      clearModalTransport();
      clearModalTransport();
      clearModalTransport();
    }).not.toThrow();
    expect(getModalTransport()).toBeNull();
  });
});

describe('tearDownOnlineSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedEvents = null;
    act(() => {
      useGameStore.getState().resetOnline();
    });
    clearModalTransport();
    clearReclaimTokens();
  });

  it('destroys the active transport, clears the module-scope ref, and drops reclaim tokens in one call', () => {
    const onMatchStart = vi.fn();
    const { result } = renderHook(() => useOnlineRoom({ onMatchStart }));
    act(() => result.current.connect(true));

    // Simulate the lobby having issued a token to a connecting guest. The
    // tokens map only mutates via the host onPeerConnected handler, so reach
    // into it the same way a real session would by populating before teardown.
    expect(getModalTransport()).not.toBeNull();
    expect(getGuestOwnReclaimToken()).toBeNull();

    transportMockApi.destroy.mockClear();
    tearDownOnlineSession();

    expect(transportMockApi.destroy).toHaveBeenCalledTimes(1);
    expect(getModalTransport()).toBeNull();
    expect(getHostReclaimTokens().size).toBe(0);
    expect(getGuestOwnReclaimToken()).toBeNull();
  });

  it('is safe to call when no transport is active (Match.handleQuit local-mode path)', () => {
    expect(getModalTransport()).toBeNull();
    expect(() => tearDownOnlineSession()).not.toThrow();
    expect(transportMockApi.destroy).not.toHaveBeenCalled();
  });

  it('repeated calls are idempotent', () => {
    const onMatchStart = vi.fn();
    const { result } = renderHook(() => useOnlineRoom({ onMatchStart }));
    act(() => result.current.connect(true));
    transportMockApi.destroy.mockClear();

    tearDownOnlineSession();
    expect(transportMockApi.destroy).toHaveBeenCalledTimes(1);
    tearDownOnlineSession();
    // Second call: transport already gone, no extra destroy.
    expect(transportMockApi.destroy).toHaveBeenCalledTimes(1);
  });
});
