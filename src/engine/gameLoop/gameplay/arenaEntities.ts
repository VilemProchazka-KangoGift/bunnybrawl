import type { MatchState, EffectZone } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { swapRemove } from '../../themes/utils';
import { fastSin } from '../../fastMath';

const f = Math.fround;

export function updateLavaRocks(
  state: MatchState, theme: ThemeConfig, dt: number, gameRandom: () => number,
): void {
  const lrc = theme.lavaRockConfig;
  if (!lrc) return;
  state.lavaRockTimer = f(state.lavaRockTimer - dt);
  if (state.lavaRockTimer <= 0) {
    state.lavaRockTimer = f(lrc.spawnInterval[0] + gameRandom() * (lrc.spawnInterval[1] - lrc.spawnInterval[0]));
    state.lavaRocks.push({
      x: f(80 + gameRandom() * (CANVAS_WIDTH - 160)),
      y: -20,
      vy: f(lrc.fallSpeed[0] + gameRandom() * (lrc.fallSpeed[1] - lrc.fallSpeed[0])),
      size: f(lrc.sizeRange[0] + gameRandom() * (lrc.sizeRange[1] - lrc.sizeRange[0])),
      rotation: f(gameRandom() * Math.PI * 2),
      active: true,
    });
  }
  for (const rock of state.lavaRocks) {
    rock.y = f(rock.y + f(rock.vy * dt));
    rock.rotation = f(rock.rotation + f(dt * 3));
    if (rock.y > CANVAS_HEIGHT + 30) rock.active = false;
  }
  for (let i = state.lavaRocks.length - 1; i >= 0; i--) {
    if (!state.lavaRocks[i].active) {
      swapRemove(state.lavaRocks, i);
    }
  }
}

export function updateGhosts(state: MatchState, dt: number): void {
  for (const ghost of state.ghosts) {
    ghost.x = f(ghost.x + f(ghost.vx * dt));
    ghost.wobblePhase = f(ghost.wobblePhase + f(dt * 2));
    ghost.y = f(ghost.y + f(fastSin(ghost.wobblePhase) * f(20 * dt)));
    if (ghost.vx > 0 && ghost.x > CANVAS_WIDTH + ghost.size) {
      ghost.x = -ghost.size;
      ghost.y = f(300 + (ghost.wobblePhase % 1) * 300);
    } else if (ghost.vx < 0 && ghost.x < -ghost.size) {
      ghost.x = CANVAS_WIDTH + ghost.size;
      ghost.y = f(300 + (ghost.wobblePhase % 1) * 300);
    }
  }
}

export function updateGeyserTimers(
  state: MatchState, geyserZones: readonly EffectZone[], dt: number,
): void {
  for (let gi = 0; gi < state.geyserStates.length; gi++) {
    const gs = state.geyserStates[gi];
    const gz = geyserZones[gi];
    if (!gz) continue;
    if (!gs.active) {
      gs.timer = f(gs.timer - dt);
      if (gs.timer <= 0) {
        gs.active = true;
        gs.activeTimer = gz.duration || 3;
      }
    } else {
      gs.activeTimer = f(gs.activeTimer - dt);
      if (gs.activeTimer <= 0) {
        gs.active = false;
        gs.timer = gz.interval || 10;
      }
    }
  }
}

export function updatePigeonFlocks(state: MatchState, dt: number): void {
  for (const flock of state.pigeonFlocks) {
    if (!flock.active) {
      flock.respawnTimer = f(flock.respawnTimer - dt);
      if (flock.respawnTimer <= 0) flock.active = true;
    }
  }
}

// Parallel of updatePigeonFlocks for species-aware scatterFlocks (birds, bats, crows).
export function updateScatterFlocks(state: MatchState, dt: number): void {
  for (const flock of state.scatterFlocks) {
    if (!flock.active) {
      flock.respawnTimer = f(flock.respawnTimer - dt);
      if (flock.respawnTimer <= 0) {
        flock.active = true;
        flock.armed = true;
      }
    }
  }
}
