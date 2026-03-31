import { create } from 'zustand';
import type { GameScreen, MatchSettings, CharacterSlot, MatchState } from '../engine/types';

interface GameStore {
  screen: GameScreen;
  matchSettings: MatchSettings;
  activePlayers: CharacterSlot[];
  lastMatchState: MatchState | null;
  winner: CharacterSlot | null;

  setScreen: (screen: GameScreen) => void;
  setMatchSettings: (settings: Partial<MatchSettings>) => void;
  setActivePlayers: (players: CharacterSlot[]) => void;
  setMatchResult: (winner: CharacterSlot | null, state: MatchState) => void;
  reset: () => void;
}

function loadGoreMode(): boolean {
  try { return localStorage.getItem('bunnybrawl_gore') === 'true'; } catch { return false; }
}

function loadArenaId(): string {
  try { return localStorage.getItem('bunnybrawl_arena') || 'meadow'; } catch { return 'meadow'; }
}

const defaultSettings: MatchSettings = {
  killLimit: 10,
  timeLimit: 180, // 3 minutes
  playerCount: 2,
  goreMode: loadGoreMode(),
  arenaId: loadArenaId(),
};

export const useGameStore = create<GameStore>((set) => ({
  screen: 'menu',
  matchSettings: { ...defaultSettings },
  activePlayers: [],
  lastMatchState: null,
  winner: null,

  setScreen: (screen) => set({ screen }),

  setMatchSettings: (settings) =>
    set((state) => {
      const next = { ...state.matchSettings, ...settings };
      if ('goreMode' in settings) {
        try { localStorage.setItem('bunnybrawl_gore', String(next.goreMode)); } catch { /* noop */ }
      }
      if ('arenaId' in settings) {
        try { localStorage.setItem('bunnybrawl_arena', next.arenaId); } catch { /* noop */ }
      }
      return { matchSettings: next };
    }),

  setActivePlayers: (players) => set({ activePlayers: players }),

  setMatchResult: (winner, matchState) =>
    set({ winner, lastMatchState: matchState, screen: 'victory' }),

  reset: () =>
    set({
      screen: 'menu',
      matchSettings: { ...defaultSettings },
      activePlayers: [],
      lastMatchState: null,
      winner: null,
    }),
}));
