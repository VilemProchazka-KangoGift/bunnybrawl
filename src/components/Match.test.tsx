/**
 * Tests for Match.tsx — focused on the handleQuit timer-cleanup fix.
 *
 * The bug: handleQuit didn't clear victoryTimeoutRef + disconnectDelayRef
 * before navigating to menu. If the user clicked Quit while either timer
 * was pending, the timer would fire after navigation and push the user
 * back to victory.
 *
 * We mock GameLoop / NetMatch / matchLoading so the test can capture the
 * onMatchEnd callback and call it manually, then click Quit and verify
 * the screen does NOT transition to victory after the timer would have
 * fired.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useGameStore } from '../store/gameStore';
import type { PlayerSlot, MatchState } from '../engine/types';

// ---- Capture the GameLoop's onMatchEnd + phase-change subscriber ----

let capturedOnMatchEnd: ((winner: PlayerSlot | null, state: MatchState) => void) | null = null;
let capturedOnPhaseChange: ((phase: 'loading' | 'playing' | 'over') => void) | null = null;
const gameLoopMockApi = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  isPaused: vi.fn(() => false),
  getState: vi.fn(() => ({ players: [], matchOver: false, winner: null, phase: 'playing' })),
  setOnPhaseChange: vi.fn((cb: (phase: 'loading' | 'playing' | 'over') => void) => {
    capturedOnPhaseChange = cb;
  }),
  getTouchInput: vi.fn(() => null),
  getRenderer: vi.fn(() => ({})),
  getArena: vi.fn(() => ({ themeId: 'meadow', platforms: [], spawnPoints: [] })),
  getActiveCharacterNames: vi.fn(() => []),
  getOriginalArena: vi.fn(() => ({})),
  getLoadingGeneration: vi.fn(() => 0),
  // setPhase normally fires onPhaseChange — replicate that here so the
  // loading overlay can clear in tests too.
  setPhase: vi.fn((phase: 'loading' | 'playing' | 'over') => {
    capturedOnPhaseChange?.(phase);
  }),
  switchArena: vi.fn(),
  skipCountdown: vi.fn(),
  setNetworkMode: vi.fn(),
  setLocalSlot: vi.fn(),
  setPlayerNames: vi.fn(),
  disconnectPlayer: vi.fn(),
  resetCosmeticBaselines: vi.fn(),
};

vi.mock('../engine/gameLoop', () => ({
  GameLoop: class MockGameLoop {
    constructor(
      _bg: HTMLCanvasElement,
      _fg: HTMLCanvasElement,
      _arena: unknown,
      _settings: unknown,
      _players: unknown,
      onMatchEnd: (winner: PlayerSlot | null, state: MatchState) => void,
    ) {
      capturedOnMatchEnd = onMatchEnd;
      Object.assign(this, gameLoopMockApi);
    }
  },
}));

vi.mock('../engine/net/netMatch', () => ({
  NetMatch: class MockNetMatch {
    start = vi.fn();
    stop = vi.fn();
    pause = vi.fn();
    resume = vi.fn();
    setMatchOver = vi.fn();
    getGameLoop = vi.fn(() => gameLoopMockApi);
    markHostLoaded = vi.fn();
    signalGuestLoaded = vi.fn();
    resetLoadingHandshake = vi.fn();
  },
}));

const transportMockApi = {
  destroy: vi.fn(),
  sendReliable: vi.fn(),
  sendReliableTo: vi.fn(),
};

vi.mock('./OnlineModal', () => ({
  getModalTransport: vi.fn(() => transportMockApi),
  clearModalTransport: vi.fn(),
}));

vi.mock('../engine/matchLoading', () => ({
  runLoadingTasks: vi.fn(() => Promise.resolve()),
}));

// Touch detection — keep desktop mode (avoids the wake lock branch entirely)
vi.mock('../engine/touchDetect', () => ({
  isTouchPrimary: () => false,
}));

import { Match } from './Match';
import { registerBuiltinArenas } from '../engine/arenas';
import { registerBuiltinCharacters } from '../engine/characters';

// Arena/character registries are populated at App-mount in production. Tests
// don't run App.tsx, so register them once here so getArena('meadow') succeeds.
registerBuiltinArenas();
registerBuiltinCharacters();

describe('Match — handleQuit timer cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    capturedOnMatchEnd = null;
    capturedOnPhaseChange = null;
    act(() => {
      useGameStore.getState().reset();
      useGameStore.getState().setActivePlayers(['P1' as PlayerSlot, 'P2' as PlayerSlot]);
      useGameStore.getState().setScreen('match');
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Render Match and clear the loading overlay (which would otherwise block
   *  the pause menu / quit button). The overlay flips off when the GameLoop
   *  fires its onPhaseChange('playing') callback — we capture that callback
   *  in the GameLoop mock and trigger it directly. Also marks localTasksDone
   *  by resolving the runLoadingTasks promise via fake-timer microtask flush. */
  async function renderActive() {
    const r = render(<Match />);
    // Drain microtasks so kickoffLoading's .finally fires (sets localTasksDone).
    // Use real timers temporarily because vi.useFakeTimers() in some configs
    // intercepts queueMicrotask, blocking promise-chain progression.
    vi.useRealTimers();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    vi.useFakeTimers();
    // Fire phase change to 'playing' so phaseIsLoading flips off.
    expect(capturedOnPhaseChange).toBeTruthy();
    act(() => capturedOnPhaseChange!('playing'));
    return r;
  }

  function clickQuit() {
    // Fire Escape; act-wrap so React commits the setPaused(true) before query
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    const quitBtn = screen.getByTestId('quit-button');
    act(() => { fireEvent.click(quitBtn); });
  }

  it('clicking Quit during a pending victory timer does NOT push to victory after the timer fires', async () => {
    await renderActive();
    expect(capturedOnMatchEnd).toBeTruthy();

    // Game just ended — schedules setMatchResult in 1500ms
    act(() => capturedOnMatchEnd!('P1' as PlayerSlot, { players: [] } as unknown as MatchState));

    // Sanity: not yet on victory
    expect(useGameStore.getState().screen).toBe('match');

    // User clicks Quit before the 1500ms elapses
    clickQuit();
    expect(useGameStore.getState().screen).toBe('menu');

    // Advance well past the 1500ms timer.
    // If the bug existed (handleQuit didn't clear victoryTimeoutRef), the
    // timer would now fire setMatchResult, which sets screen to 'victory'.
    act(() => { vi.advanceTimersByTime(3000); });

    expect(useGameStore.getState().screen).toBe('menu');
    expect(useGameStore.getState().winner).toBeNull();
  });

  it('clicking Quit without any pending timer transitions to menu cleanly', async () => {
    await renderActive();
    clickQuit();
    expect(useGameStore.getState().screen).toBe('menu');
    // No spurious state changes after timer wheel spin
    act(() => { vi.advanceTimersByTime(5000); });
    expect(useGameStore.getState().screen).toBe('menu');
  });

  it('handleQuit calls transport.destroy and resets online state', async () => {
    await renderActive();
    transportMockApi.destroy.mockClear();
    clickQuit();
    expect(transportMockApi.destroy).toHaveBeenCalled();
    expect(useGameStore.getState().online.isOnline).toBe(false);
  });

  it('handleQuit stops the GameLoop', async () => {
    await renderActive();
    gameLoopMockApi.stop.mockClear();
    clickQuit();
    expect(gameLoopMockApi.stop).toHaveBeenCalled();
  });

  it('Quit followed by remount does not rehydrate stale state', async () => {
    const { unmount } = await renderActive();
    act(() => capturedOnMatchEnd!('P1' as PlayerSlot, { players: [] } as unknown as MatchState));
    clickQuit();
    unmount();
    // Even after extensive timer flushing, store stays at menu.
    act(() => { vi.advanceTimersByTime(10000); });
    expect(useGameStore.getState().screen).toBe('menu');
  });
});
