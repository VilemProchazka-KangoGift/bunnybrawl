/**
 * Snapshot data types — pure interfaces, no behavior. Importing this file
 * pulls in nothing more than `engine/types` (which is already pure).
 *
 * Split out of `net/snapshot.ts` so the binary codec and the gameplay-facing
 * extractor can evolve independently. The wire format is locked by
 * `snapshot-wire-format.test.ts` and `PROTOCOL_VERSION` in `core/protocol.ts`.
 */
import type {
  PlayerSlot, KillFeedEntry, MatchPhase, WirePlayer,
} from '../../types';

// ---- Snapshot data structures ----

/**
 * SnapshotPlayer is the per-player wire shape. As of Phase 12 it's an
 * alias for `WirePlayer` (defined in `engine/types.ts`) — extending the
 * snapshot is a single-source-of-truth edit there. See
 * `net/snapshot/schema.ts` for the wire layout description.
 */
export type SnapshotPlayer = WirePlayer;

export interface AuthSnapshot {
  frame: number;
  phase: MatchPhase;
  players: SnapshotPlayer[];
  carrots: Array<{ x: number; y: number; active: boolean }>;
  springs: Array<{ x: number; y: number; bounceTimer: number; life: number; growTimer: number }>;
  thorns: Array<{ x: number; y: number; life: number; growTimer: number; hit: boolean }>;
  ghosts: Array<{ x: number; y: number; vx: number; wobblePhase: number }>;
  lavaRocks: Array<{ x: number; y: number; vy: number; active: boolean }>;
  geyserStates: Array<{ timer: number; active: boolean; activeTimer: number }>;
  killFeed: KillFeedEntry[];
  /** Match-wide stomp counter (uncapped; killFeed is the last-10 HUD slice).
   *  Source of truth for VictoryScreen "Total Splats". Encoded as Uint16 —
   *  caps at 65535 stomps which is far beyond any practical match length. */
  totalKills: number;
  timeElapsed: number;
  countdown: number;
  dayPhase: number;
  matchOver: boolean;
  winner: PlayerSlot | null;
  screenShake: number;
  slowMotion: number;
  screenFlash: number;
  hitstopZoom: number;
  scoreAnimations: Array<{ playerId: PlayerSlot; value: number; timer: number }>;
}

/** Build a fully-formed empty AuthSnapshot. All arrays exist and are empty so
 *  V8 can lock the hidden class on first use; pooled instances reuse the same
 *  shape for every decode. */
export function createEmptySnapshot(): AuthSnapshot {
  return {
    frame: 0,
    phase: 'loading',
    players: [],
    carrots: [],
    springs: [],
    thorns: [],
    ghosts: [],
    lavaRocks: [],
    geyserStates: [],
    killFeed: [],
    totalKills: 0,
    timeElapsed: 0,
    countdown: 0,
    dayPhase: 0,
    matchOver: false,
    winner: null,
    screenShake: 0,
    slowMotion: 0,
    screenFlash: 0,
    hitstopZoom: 0,
    scoreAnimations: [],
  };
}
