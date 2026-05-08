/**
 * Transitional re-export shim for the snapshot module.
 *
 * The binary codec has moved to `snapshot/binaryCodec.ts`; types are in
 * `snapshot/types.ts`. The gameplay-facing extractor `takeAuthSnapshot`
 * is still here and moves out in a follow-up commit. The wire format is
 * unchanged — locked by `snapshot-wire-format.test.ts` and `PROTOCOL_VERSION`.
 *
 * Existing import sites (`from './snapshot'`, `from '../snapshot'`) keep
 * working unchanged.
 */
import type { MatchState } from '../types';
import type { AuthSnapshot } from './snapshot/types';

// Public surface re-exports — same names as before the split.
export type { AuthSnapshot, SnapshotPlayer } from './snapshot/types';
export { createEmptySnapshot } from './snapshot/types';
export { encodeSnapshot, decodeSnapshot } from './snapshot/binaryCodec';

/**
 * Extract an AuthSnapshot from the current MatchState.
 * Called by the host every tick to prepare state for transmission.
 */
export function takeAuthSnapshot(frame: number, state: MatchState): AuthSnapshot {
  return {
    frame,
    phase: state.phase,
    players: state.players.map(p => ({
      id: p.id,
      x: p.x, y: p.y,
      vx: p.vx, vy: p.vy,
      state: p.state,
      facing: p.facing,
      animFrame: p.animFrame,
      score: p.score,
      hitstopTimer: p.hitstopTimer,
      invincibleTimer: p.invincibleTimer,
      fastFalling: p.fastFalling,
      splatTimer: p.splatTimer,
      respawnTimer: p.respawnTimer,
      fatTimer: p.fatTimer,
      slowTimer: p.slowTimer,
      burnTimer: p.burnTimer,
      squashScale: p.squashScale,
      expression: p.expression,
      killStreak: p.killStreak,
      disconnected: p.disconnected,
      active: p.active,
      width: p.width,
      height: p.height,
      sideSquash: p.sideSquash,
      damageFlashTimer: p.damageFlashTimer,
      damageFlashSide: p.damageFlashSide,
    })),
    carrots: state.carrots.map(c => ({ x: c.x, y: c.y, active: c.active })),
    springs: state.springs.map(s => ({
      x: s.x, y: s.y,
      bounceTimer: s.bounceTimer, life: s.life, growTimer: s.growTimer,
    })),
    thorns: state.thorns.map(t => ({
      x: t.x, y: t.y,
      life: t.life, growTimer: t.growTimer, hit: t.hit,
    })),
    ghosts: state.ghosts.map(g => ({
      x: g.x, y: g.y, vx: g.vx, wobblePhase: g.wobblePhase,
    })),
    lavaRocks: state.lavaRocks.map(r => ({
      x: r.x, y: r.y, vy: r.vy, active: r.active,
    })),
    geyserStates: state.geyserStates.map(gs => ({
      timer: gs.timer, active: gs.active, activeTimer: gs.activeTimer,
    })),
    killFeed: state.killFeed,
    totalKills: state.totalKills,
    timeElapsed: state.timeElapsed,
    countdown: state.countdown,
    dayPhase: state.dayPhase,
    matchOver: state.matchOver,
    winner: state.winner,
    screenShake: state.screenShake,
    slowMotion: state.slowMotion,
    screenFlash: state.screenFlash,
    hitstopZoom: state.hitstopZoom,
    scoreAnimations: state.scoreAnimations,
  };
}

// ---- Delta compression (re-exported from core) ----
export { createDelta, applyDelta } from './core/deltaCompression';
