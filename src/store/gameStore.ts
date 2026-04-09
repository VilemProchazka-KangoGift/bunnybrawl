import { create } from 'zustand';
import type { GameScreen, MatchSettings, PlayerSlot, MatchState, GameMods } from '../engine/types';
import type { ConnectionStatus } from '../engine/net/transport';

export interface RemotePlayerInfo {
  peerId: string;
  slot: PlayerSlot;
  characterName: string;
  playerName: string;
  ready: boolean;
}

interface OnlineState {
  isOnline: boolean;
  isHost: boolean;
  roomCode: string | null;
  joinCode: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  /** @deprecated Use remotePlayers for multi-guest. Kept for backward compat with 1v1 code paths. */
  remoteCharacterName: string | null;
  remotePlayers: RemotePlayerInfo[];
  localSlot: PlayerSlot;
  rngSeed: number;
  playerNames: Record<string, string>;
}

interface GameStore {
  screen: GameScreen;
  matchSettings: MatchSettings;
  activePlayers: PlayerSlot[];
  lastMatchState: MatchState | null;
  winner: PlayerSlot | null;
  online: OnlineState;

  setScreen: (screen: GameScreen) => void;
  setMatchSettings: (settings: Partial<MatchSettings>) => void;
  setActivePlayers: (players: PlayerSlot[]) => void;
  disconnectWin: boolean;
  setMatchResult: (winner: PlayerSlot | null, state: MatchState, disconnected?: boolean) => void;
  setOnline: (state: Partial<OnlineState>) => void;
  resetOnline: () => void;
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
  mods: loadStorage<GameMods>('bunnybrawl_mods', v => {
    try {
      const p = JSON.parse(v || '');
      return { extremeGore: !!p.extremeGore, carrotChase: !!p.carrotChase, giantPlayers: !!p.giantPlayers, turbo: !!p.turbo, superBounce: !!p.superBounce, mirrorArena: !!p.mirrorArena, underwaterGravity: !!p.underwaterGravity };
    } catch { return null as any; }
  }, { extremeGore: false, carrotChase: false, giantPlayers: false, turbo: false, superBounce: false, mirrorArena: false, underwaterGravity: false }),
};

const defaultOnline: OnlineState = {
  isOnline: false,
  isHost: false,
  roomCode: null,
  joinCode: null,
  connectionStatus: 'idle',
  connectionError: null,
  remoteCharacterName: null,
  remotePlayers: [],
  localSlot: 'P1',
  rngSeed: 0,
  playerNames: {},
};

export const useGameStore = create<GameStore>((set) => ({
  screen: 'menu',
  matchSettings: { ...defaultSettings },
  activePlayers: [],
  lastMatchState: null,
  winner: null,
  disconnectWin: false,
  online: { ...defaultOnline },

  setScreen: (screen) => set({ screen }),

  setMatchSettings: (settings) =>
    set((state) => {
      const next = { ...state.matchSettings, ...settings };
      if ('goreMode' in settings) saveStorage('bunnybrawl_gore', String(next.goreMode));
      if ('arenaId' in settings) saveStorage('bunnybrawl_arena', next.arenaId);
      if ('botCount' in settings) saveStorage('bunnybrawl_botcount', String(next.botCount));
      if ('botDifficulty' in settings) saveStorage('bunnybrawl_botdiff', next.botDifficulty);
      if ('mods' in settings) saveStorage('bunnybrawl_mods', JSON.stringify(next.mods));
      return { matchSettings: next };
    }),

  setActivePlayers: (players) => set({ activePlayers: players }),

  setMatchResult: (winner, matchState, disconnected) =>
    set({ winner, lastMatchState: matchState, screen: 'victory', disconnectWin: !!disconnected }),

  setOnline: (state) =>
    set((prev) => ({ online: { ...prev.online, ...state } })),

  resetOnline: () =>
    set({ online: { ...defaultOnline } }),

  reset: () =>
    set({
      screen: 'menu',
      matchSettings: { ...defaultSettings },
      activePlayers: [],
      lastMatchState: null,
      winner: null,
      disconnectWin: false,
      online: { ...defaultOnline },
    }),
}));

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  (window as any).__gameStore = useGameStore;
}
