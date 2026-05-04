import type { MatchState, WeatherParticle } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, SHOCKWAVE_DURATION } from '../../constants';
import { randRange, pickWeighted, swapRemove } from '../../themes/utils';

export function createWeatherParticle(theme: ThemeConfig, randomY: boolean): WeatherParticle {
  const chosen = pickWeighted(theme.weather.types);
  return {
    x: Math.random() * CANVAS_WIDTH,
    y: randomY ? Math.random() * CANVAS_HEIGHT : -10,
    vx: randRange(chosen.vxRange),
    vy: randRange(chosen.vyRange),
    size: randRange(chosen.sizeRange),
    type: chosen.type,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: randRange(chosen.rotSpeedRange),
    color: chosen.color,
  };
}

export function updateWeather(state: MatchState, theme: ThemeConfig, dt: number): void {
  for (let i = state.weather.length - 1; i >= 0; i--) {
    const w = state.weather[i];
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    w.rotation += w.rotSpeed * dt;
    w.vx += (Math.random() - 0.5) * 20 * dt;
    if (w.y > CANVAS_HEIGHT + 10 || w.x > CANVAS_WIDTH + 10) {
      state.weather[i] = createWeatherParticle(theme, false);
    }
  }
}

export function updateWildlife(state: MatchState, dt: number): void {
  for (const w of state.wildlife) {
    w.wingPhase += dt * 8;
    if (w.type === 'butterfly') {
      w.x += w.vx * dt;
      w.vy = Math.sin(w.wingPhase * 0.5) * 20;
      w.y += w.vy * dt;
      if (w.x > CANVAS_WIDTH + 20) w.x = -20;
      if (w.x < -20) w.x = CANVAS_WIDTH + 20;
      if (w.y < -20) w.y = CANVAS_HEIGHT * 0.6;
      if (w.y > CANVAS_HEIGHT * 0.6) w.y = 0;
    } else {
      w.x += w.vx * dt;
      w.y += Math.sin(w.wingPhase * 0.3) * 5 * dt;
      if (w.x > CANVAS_WIDTH + 50) {
        w.x = -50 - Math.random() * 100;
        w.y = Math.random() * CANVAS_HEIGHT * 0.4;
        w.vx = 40 + Math.random() * 40;
      }
    }
  }
}

export function updateFog(state: MatchState, dt: number): void {
  for (const fg of state.fogParticles) {
    fg.x += fg.vx * dt;
    if (fg.x > CANVAS_WIDTH + 30) fg.x = -30;
  }
}

export function updatePollen(state: MatchState, dt: number): void {
  for (const p of state.pollenParticles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.y < -10) {
      p.y = CANVAS_HEIGHT + 10;
      p.x = Math.random() * CANVAS_WIDTH;
    }
  }
}

export function updateShootingStars(state: MatchState, theme: ThemeConfig, dt: number): void {
  // Spawn rate ~0.3/sec at night. dt-scaled so half-rate cosmetic doesn't
  // halve the rate (was Math.random() < 0.005, baked for 60Hz tick — became
  // ~0.15/sec when cosmeticStep moved to 30Hz).
  if (theme.dayNight.showShootingStars && state.dayPhase > 0.4 && Math.random() < 0.3 * dt) {
    const svx = 300 + Math.random() * 200;
    const svy = 50 + Math.random() * 50;
    state.shootingStars.push({
      x: Math.random() * CANVAS_WIDTH * 0.5,
      y: Math.random() * CANVAS_HEIGHT * 0.3,
      vx: svx, vy: svy, life: 0.4,
      tailLen: Math.min(40, Math.sqrt(svx * svx + svy * svy) * 0.1),
    });
  }
  for (let i = state.shootingStars.length - 1; i >= 0; i--) {
    const star = state.shootingStars[i];
    star.x += star.vx * dt;
    star.y += star.vy * dt;
    star.life -= dt;
    if (star.life <= 0) swapRemove(state.shootingStars, i);
  }
}

export function updateShockwaves(state: MatchState, dt: number): void {
  for (const sw of state.shockwaves) {
    const progress = 1 - sw.life / SHOCKWAVE_DURATION;
    sw.radius = sw.maxRadius * progress;
    sw.life -= dt;
  }
  for (let i = state.shockwaves.length - 1; i >= 0; i--) {
    if (state.shockwaves[i].life <= 0) {
      swapRemove(state.shockwaves, i);
    }
  }
}

export function updateScoreAnimations(state: MatchState, dt: number): void {
  for (const sa of state.scoreAnimations) {
    sa.timer -= dt;
  }
  for (let i = state.scoreAnimations.length - 1; i >= 0; i--) {
    if (state.scoreAnimations[i].timer <= 0) {
      swapRemove(state.scoreAnimations, i);
    }
  }
}

export function updateBouncyWobble(state: MatchState, dt: number): void {
  for (const [bi, timer] of state.bouncyWobble) {
    const next = timer - dt;
    if (next <= 0) state.bouncyWobble.delete(bi);
    else state.bouncyWobble.set(bi, next);
  }
}

export function updatePigeonScatterParticles(state: MatchState, dt: number): void {
  for (const flock of state.pigeonFlocks) {
    for (let si = flock.scatterParticles.length - 1; si >= 0; si--) {
      const sp = flock.scatterParticles[si];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += 100 * dt;
      sp.life -= dt;
      if (sp.life <= 0) swapRemove(flock.scatterParticles, si);
    }
  }
}

// Scatter-flock particles (birds, bats, crows). Bats float (low gravity);
// birds and crows fall with normal gravity.
export function updateScatterFlockParticles(state: MatchState, dt: number): void {
  for (const flock of state.scatterFlocks) {
    const grav = flock.species === 'bat' ? 20 : 80;
    for (let si = flock.scatterParticles.length - 1; si >= 0; si--) {
      const sp = flock.scatterParticles[si];
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy += grav * dt;
      sp.vx *= 0.99;
      sp.life -= dt;
      if (sp.life <= 0) swapRemove(flock.scatterParticles, si);
    }
  }
}
