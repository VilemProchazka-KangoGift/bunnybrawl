/**
 * Extract an AuthSnapshot from MatchState.
 *
 * THIS IS THE ONLY FILE in the snapshot/ module that imports from gameplay
 * (`engine/types`). Everything else (types.ts, binaryCodec.ts) is Node-pure
 * and can be reused by future schema-driven codecs without dragging the
 * whole engine in.
 */
import type { MatchState } from '../../types';
import type { AuthSnapshot } from './types';
import { createEmptySnapshot } from './types';

/**
 * Pooled scratch — the snapshot is consumed synchronously by `encodeSnapshot`
 * before the next call (host path: takeAuthSnapshot → encodeSnapshot →
 * broadcast bytes → drop reference). Reused across all callers (main host,
 * worker host, tests) since the consumption pattern is identical.
 */
const _scratch: AuthSnapshot = createEmptySnapshot();

/**
 * Extract an AuthSnapshot from the current MatchState.
 * Called by the host every tick to prepare state for transmission.
 *
 * Returns a reused scratch object. Entity arrays are direct references to
 * MatchState arrays — the binary encoder reads only the wire-relevant
 * fields, ignoring extras like `Carrot.spawnTime` or `Player.character`.
 * Callers MUST consume the snapshot before the next `takeAuthSnapshot`
 * call; storing the reference across ticks will see mutated data.
 */
export function takeAuthSnapshot(frame: number, state: MatchState): AuthSnapshot {
  const s = _scratch;
  s.frame = frame;
  s.phase = state.phase;
  // Direct references — encoder reads wire-relevant fields only; extras on
  // the source types (Carrot.spawnTime, SpringMushroom.platformIndex,
  // Thorn.width/height/platformIndex, Ghost.size/alpha, LavaRock.size/rotation,
  // Player local-only fields) are ignored. Casts narrow the type to the
  // wire-relevant subset that AuthSnapshot promises.
  s.players = state.players as unknown as AuthSnapshot['players'];
  s.carrots = state.carrots as unknown as AuthSnapshot['carrots'];
  s.springs = state.springs as unknown as AuthSnapshot['springs'];
  s.thorns = state.thorns as unknown as AuthSnapshot['thorns'];
  s.ghosts = state.ghosts as unknown as AuthSnapshot['ghosts'];
  s.lavaRocks = state.lavaRocks as unknown as AuthSnapshot['lavaRocks'];
  s.geyserStates = state.geyserStates as unknown as AuthSnapshot['geyserStates'];
  s.killFeed = state.killFeed;
  s.totalKills = state.totalKills;
  s.timeElapsed = state.timeElapsed;
  s.countdown = state.countdown;
  s.dayPhase = state.dayPhase;
  s.matchOver = state.matchOver;
  s.winner = state.winner;
  s.screenShake = state.screenShake;
  s.slowMotion = state.slowMotion;
  s.screenFlash = state.screenFlash;
  s.hitstopZoom = state.hitstopZoom;
  s.scoreAnimations = state.scoreAnimations;
  return s;
}
