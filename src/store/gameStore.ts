import { create } from 'zustand';
import type { GameScreen, MatchSettings, PlayerSlot, MatchState, GameMods } from '../engine/types';
import type { ConnectionStatus } from '../engine/net/transport';
import { MAX_BOT_COUNT } from '../engine/constants';
import { safeStorage } from '../storage';

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
  remotePlayers: RemotePlayerInfo[];
  localSlot: PlayerSlot;
  rngSeed: number;
  playerNames: Record<string, string>;
}

export interface GameStore {
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
  /** Clear winner / lastMatchState / disconnectWin without changing screen.
   *  Used by rematch and quit-to-menu paths to prevent ghost data from a
   *  prior match leaking into the next one (e.g. if the new match's
   *  onMatchEnd is delayed or the user navigates away early). */
  clearMatchResult: () => void;
  setOnline: (state: Partial<OnlineState>) => void;
  resetOnline: () => void;
  reset: () => void;
}

// safeStorage swallows storage errors; this guard handles parse() throwing on
// malformed JSON written by an older build.
function loadStorage<T>(key: string, parse: (raw: string | null) => T, fallback: T): T {
  try { return parse(safeStorage.get(key)) ?? fallback; } catch { return fallback; }
}

const defaultSettings: MatchSettings = {
  killLimit: 16,
  timeLimit: 180, // 3 minutes
  playerCount: 2,
  goreMode: loadStorage('carrotroyale_gore', v => v === 'true', false),
  arenaId: loadStorage('carrotroyale_arena', v => v || 'meadow', 'meadow'),
  botCount: loadStorage('carrotroyale_botcount', v => Math.min(MAX_BOT_COUNT, parseInt(v || '0', 10) || 0), 0),
  botDifficulty: loadStorage<'easy' | 'medium' | 'hard' | 'impossible'>('carrotroyale_botdiff', v => {
    return v === 'easy' || v === 'medium' || v === 'hard' || v === 'impossible' ? v : 'medium';
  }, 'medium'),
  mods: loadStorage<GameMods>('carrotroyale_mods', v => {
    const p = JSON.parse(v || '');
    return { extremeGore: !!p.extremeGore, carrotChase: !!p.carrotChase, giantPlayers: !!p.giantPlayers, turbo: !!p.turbo, superBounce: !!p.superBounce, mirrorArena: !!p.mirrorArena, underwaterGravity: !!p.underwaterGravity };
  }, { extremeGore: false, carrotChase: false, giantPlayers: false, turbo: false, superBounce: false, mirrorArena: false, underwaterGravity: false }),
};

const defaultOnline: OnlineState = {
  isOnline: false,
  isHost: false,
  roomCode: null,
  joinCode: null,
  connectionStatus: 'idle',
  connectionError: null,
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
      if ('goreMode' in settings) safeStorage.set('carrotroyale_gore', String(next.goreMode));
      if ('arenaId' in settings) safeStorage.set('carrotroyale_arena', next.arenaId);
      if ('botCount' in settings) safeStorage.set('carrotroyale_botcount', String(next.botCount));
      if ('botDifficulty' in settings) safeStorage.set('carrotroyale_botdiff', next.botDifficulty);
      if ('mods' in settings) safeStorage.set('carrotroyale_mods', JSON.stringify(next.mods));
      return { matchSettings: next };
    }),

  setActivePlayers: (players) => set({ activePlayers: players }),

  setMatchResult: (winner, matchState, disconnected) =>
    set({ winner, lastMatchState: matchState, screen: 'victory', disconnectWin: !!disconnected }),

  clearMatchResult: () =>
    set({ winner: null, lastMatchState: null, disconnectWin: false }),

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
  window.__gameStore = useGameStore;
}
