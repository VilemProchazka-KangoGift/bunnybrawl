import { create } from 'zustand';
import type { GameScreen, MatchSettings, PlayerSlot, MatchState } from '../engine/types';

interface GameStore {
  screen: GameScreen;
  matchSettings: MatchSettings;
  activePlayers: PlayerSlot[];
  lastMatchState: MatchState | null;
  winner: PlayerSlot | null;

  setScreen: (screen: GameScreen) => void;
  setMatchSettings: (settings: Partial<MatchSettings>) => void;
  setActivePlayers: (players: PlayerSlot[]) => void;
  setMatchResult: (winner: PlayerSlot | null, state: MatchState) => void;
  reset: () => void;
}

function loadGoreMode(): boolean {
  try { return localStorage.getItem('bunnybrawl_gore') === 'true'; } catch { return false; }
}

function loadArenaId(): string {
  try { return localStorage.getItem('bunnybrawl_arena') || 'meadow'; } catch { return 'meadow'; }
}

function loadBotCount(): number {
  try { return parseInt(localStorage.getItem('bunnybrawl_botcount') || '0', 10) || 0; } catch { return 0; }
}

function loadBotDifficulty(): 'easy' | 'medium' | 'hard' {
  try {
    const val = localStorage.getItem('bunnybrawl_botdiff');
    return val === 'easy' || val === 'medium' || val === 'hard' ? val : 'medium';
  } catch { return 'medium'; }
}

const defaultSettings: MatchSettings = {
  killLimit: 16,
  timeLimit: 180, // 3 minutes
  playerCount: 2,
  goreMode: loadGoreMode(),
  arenaId: loadArenaId(),
  botCount: loadBotCount(),
  botDifficulty: loadBotDifficulty(),
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
      if ('botCount' in settings) {
        try { localStorage.setItem('bunnybrawl_botcount', String(next.botCount)); } catch { /* noop */ }
      }
      if ('botDifficulty' in settings) {
        try { localStorage.setItem('bunnybrawl_botdiff', next.botDifficulty); } catch { /* noop */ }
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
