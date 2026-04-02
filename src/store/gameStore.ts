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

function loadStorage<T>(key: string, parse: (raw: string | null) => T, fallback: T): T {
  try { return parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function saveStorage(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* noop */ }
}

const defaultSettings: MatchSettings = {
  killLimit: 16,
  timeLimit: 180, // 3 minutes
  playerCount: 2,
  goreMode: loadStorage('bunnybrawl_gore', v => v === 'true', false),
  arenaId: loadStorage('bunnybrawl_arena', v => v || 'meadow', 'meadow'),
  botCount: loadStorage('bunnybrawl_botcount', v => parseInt(v || '0', 10) || 0, 0),
  botDifficulty: loadStorage<'easy' | 'medium' | 'hard' | 'impossible'>('bunnybrawl_botdiff', v => {
    return v === 'easy' || v === 'medium' || v === 'hard' || v === 'impossible' ? v : 'medium';
  }, 'medium'),
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
      if ('goreMode' in settings) saveStorage('bunnybrawl_gore', String(next.goreMode));
      if ('arenaId' in settings) saveStorage('bunnybrawl_arena', next.arenaId);
      if ('botCount' in settings) saveStorage('bunnybrawl_botcount', String(next.botCount));
      if ('botDifficulty' in settings) saveStorage('bunnybrawl_botdiff', next.botDifficulty);
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
