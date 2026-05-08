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
