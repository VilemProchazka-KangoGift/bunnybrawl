import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';

describe('GameStore', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('starts with menu screen', () => {
    const state = useGameStore.getState();
    expect(state.screen).toBe('menu');
  });

  it('has default match settings', () => {
    const { matchSettings } = useGameStore.getState();
    expect(matchSettings.killLimit).toBe(16);
    expect(matchSettings.timeLimit).toBe(180);
    expect(matchSettings.playerCount).toBe(2);
  });

  it('setScreen changes screen', () => {
    useGameStore.getState().setScreen('charSelect');
    expect(useGameStore.getState().screen).toBe('charSelect');
  });

  it('setMatchSettings merges settings', () => {
    useGameStore.getState().setMatchSettings({ killLimit: 20 });
    const { matchSettings } = useGameStore.getState();
    expect(matchSettings.killLimit).toBe(20);
    expect(matchSettings.timeLimit).toBe(180); // unchanged
  });

  it('setActivePlayers sets players', () => {
    useGameStore.getState().setActivePlayers(['P1', 'P3']);
    expect(useGameStore.getState().activePlayers).toEqual(['P1', 'P3']);
  });

  it('setMatchResult transitions to victory', () => {
    const mockState = {
      players: [],
      killFeed: [],
      timeElapsed: 60,
      matchOver: true,
      winner: 'P1' as const,
      carrots: [],
      carrotTimer: 10,
      springs: [],
      thorns: [],
    };

    useGameStore.getState().setMatchResult('P1', mockState);
    const state = useGameStore.getState();
    expect(state.screen).toBe('victory');
    expect(state.winner).toBe('P1');
    expect(state.lastMatchState).toBe(mockState);
  });

  it('reset returns to initial state', () => {
    useGameStore.getState().setScreen('match');
    useGameStore.getState().setActivePlayers(['P1', 'P2']);
    useGameStore.getState().reset();

    const state = useGameStore.getState();
    expect(state.screen).toBe('menu');
    expect(state.activePlayers).toEqual([]);
    expect(state.winner).toBeNull();
  });

  it('all game mods default to false', () => {
    const { matchSettings } = useGameStore.getState();
    expect(matchSettings.mods).toEqual({
      extremeGore: false,
      carrotChase: false,
      giantPlayers: false,
      turbo: false,
      superBounce: false,
      mirrorArena: false,
      underwaterGravity: false,
    });
  });

  it('setMatchSettings preserves mod changes', () => {
    useGameStore.getState().setMatchSettings({
      mods: {
        extremeGore: false,
        carrotChase: false,
        giantPlayers: false,
        turbo: true,
        superBounce: false,
        mirrorArena: false,
        underwaterGravity: false,
      },
    });
    const { matchSettings } = useGameStore.getState();
    expect(matchSettings.mods.turbo).toBe(true);
    expect(matchSettings.mods.extremeGore).toBe(false);
  });

  // --- Online state ---

  it('setOnline merges partial online state', () => {
    useGameStore.getState().setOnline({ isOnline: true, isHost: true, roomCode: 'ABC' });
    const { online } = useGameStore.getState();
    expect(online.isOnline).toBe(true);
    expect(online.isHost).toBe(true);
    expect(online.roomCode).toBe('ABC');
    // Other fields unchanged
    expect(online.connectionStatus).toBe('idle');
  });

  it('resetOnline returns online to default state', () => {
    useGameStore.getState().setOnline({ isOnline: true, roomCode: 'XYZ' });
    useGameStore.getState().resetOnline();
    const { online } = useGameStore.getState();
    expect(online.isOnline).toBe(false);
    expect(online.roomCode).toBeNull();
  });

  it('setMatchResult sets disconnectWin flag', () => {
    const mockState = { players: [], killFeed: [], timeElapsed: 30, matchOver: true, winner: 'P1' as const } as any;
    useGameStore.getState().setMatchResult('P1', mockState, true);
    expect(useGameStore.getState().disconnectWin).toBe(true);
  });

  it('setMatchResult defaults disconnectWin to false', () => {
    const mockState = { players: [], killFeed: [], timeElapsed: 30, matchOver: true, winner: 'P1' as const } as any;
    useGameStore.getState().setMatchResult('P1', mockState);
    expect(useGameStore.getState().disconnectWin).toBe(false);
  });

  // --- Screen flow ---

  it('screen transitions: menu → charSelect → match → victory → menu', () => {
    const store = useGameStore.getState();
    expect(store.screen).toBe('menu');

    useGameStore.getState().setScreen('charSelect');
    expect(useGameStore.getState().screen).toBe('charSelect');

    useGameStore.getState().setScreen('match');
    expect(useGameStore.getState().screen).toBe('match');

    useGameStore.getState().setScreen('victory');
    expect(useGameStore.getState().screen).toBe('victory');

    useGameStore.getState().setScreen('menu');
    expect(useGameStore.getState().screen).toBe('menu');
  });

  // --- Settings persistence ---

  it('setMatchSettings persists goreMode to localStorage', () => {
    useGameStore.getState().setMatchSettings({ goreMode: true });
    expect(localStorage.getItem('bunnybrawl_gore')).toBe('true');
  });

  it('setMatchSettings persists arenaId to localStorage', () => {
    useGameStore.getState().setMatchSettings({ arenaId: 'volcano' });
    expect(localStorage.getItem('bunnybrawl_arena')).toBe('volcano');
  });

  it('setMatchSettings persists botCount to localStorage', () => {
    useGameStore.getState().setMatchSettings({ botCount: 3 });
    expect(localStorage.getItem('bunnybrawl_botcount')).toBe('3');
  });

  it('setMatchSettings persists botDifficulty to localStorage', () => {
    useGameStore.getState().setMatchSettings({ botDifficulty: 'hard' });
    expect(localStorage.getItem('bunnybrawl_botdiff')).toBe('hard');
  });

  it('default timeLimit is 180 seconds', () => {
    const { matchSettings } = useGameStore.getState();
    expect(matchSettings.timeLimit).toBe(180);
  });
});
