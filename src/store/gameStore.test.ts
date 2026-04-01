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
      splatMarks: [],
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
});
