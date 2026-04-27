import type { MatchState, MatchSettings, Arena, Particle, Gib, Player, PlayerSlot, EffectZone } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import type { CosmeticSystem } from '../types';
import type { HazardHitResult } from '../gameplay/playerCollisions';
import type { Renderer } from '../../renderer';
import type { ParticleEmitter } from '../../simulator/types';
import { BLOOD_COLOR, CARROT_SIZE } from '../../constants';
import { haptics } from '../../haptics';
import { emitParticle as _emitParticle, spawnDustParticles as _spawnDustParticles, spawnGoreParticles as _spawnGoreParticles, spawnConfetti as _spawnConfetti, spawnCarrotVFX as _spawnCarrotVFX, spawnRingVFX as _spawnRingVFX, spawnFirework as _spawnFirework, updateParticles, updateConfetti } from './particles';
import { launchGib, spawnGibs, updateGibs } from './gibs';
import { updateWeather } from './environment';

const CARROT_PICKUP_COLORS = ['#FF8C00', '#FF6600', '#FFA500', '#FF7700', '#FFD700', '#FF8C00'];

export class ParticleSystem implements CosmeticSystem, ParticleEmitter {
  private state: MatchState;
  private arena: Arena;
  private theme: ThemeConfig;
  private settings: MatchSettings;

  private _particles: Particle[] = [];
  private particleFreeList: Particle[] = [];
  private newBloodDripsSinceRender: Array<{ x: number; y: number; radius: number; color: string }> = [];
  private newGroundedGibsSinceRender: Gib[] = [];
  private fireworkTimer: number = 0;

  // Cached zone data (set once from arena)
  private geyserIndexMap: ReadonlyMap<EffectZone, number>;

  constructor(
    state: MatchState,
    arena: Arena,
    theme: ThemeConfig,
    settings: MatchSettings,
    geyserIndexMap: ReadonlyMap<EffectZone, number>,
  ) {
    this.state = state;
    this.arena = arena;
    this.theme = theme;
    this.settings = settings;
    this.geyserIndexMap = geyserIndexMap;
  }

  init(): void {}

  emitParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string): void {
    _emitParticle(this._particles, this.particleFreeList, x, y, vx, vy, life, size, color);
  }

  spawnDustParticles(player: Player, landVy: number): void {
    _spawnDustParticles(this._particles, this.particleFreeList, player, landVy);
  }

  spawnGoreParticles(victim: Player, extremeGore: boolean): void {
    _spawnGoreParticles(this._particles, this.particleFreeList, victim, extremeGore);
  }

  spawnConfettiVFX(victim: Player): void {
    _spawnConfetti(this.state.confetti, victim);
  }

  spawnCarrotVFX(x: number, y: number): void {
    _spawnCarrotVFX(this._particles, this.particleFreeList, x, y);
  }

  spawnRingVFX(cx: number, cy: number): void {
    _spawnRingVFX(this._particles, this.particleFreeList, cx, cy);
  }

  spawnFirework(): void {
    _spawnFirework(this._particles, this.particleFreeList);
  }

  /** Orchestration: connects gore particles, gibs, and confetti modules for a kill. */
  spawnKillSplatter(victim: Player, settings: MatchSettings): void {
    if (settings.goreMode) {
      _spawnGoreParticles(this._particles, this.particleFreeList, victim, settings.mods.extremeGore);
    }
    spawnGibs(this.state.gibs, victim, settings);
    if (!settings.goreMode) {
      _spawnConfetti(this.state.confetti, victim);
    }
  }

  /** Orchestration: connects gib launcher + particle emitter for carrot pickup. */
  pickupCarrotVFX(x: number, y: number): void {
    const cy = y + CARROT_SIZE / 2;
    // Orange carrot chunks
    for (let i = 0; i < 4; i++) {
      const s = 4 + Math.random() * 3;
      launchGib(this.state.gibs, x, cy, 10, 0.15, 0.85, 80, 200, s, s, '#FF8C00', '#CC6600', '#FFB040', '', 'body');
    }
    // Green leaf pieces
    for (let i = 0; i < 2; i++) {
      launchGib(this.state.gibs, x, cy, 8, 0.2, 0.8, 60, 160, 5, 3, '#4CAF50', '#2E7D32', '#81C784', '', 'body');
    }
    // Orange/gold particle burst
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 140;
      const life = 0.3 + Math.random() * 0.4;
      this.emitParticle(x, cy, Math.cos(angle) * speed, Math.sin(angle) * speed - 50, life, 2 + Math.random() * 5, CARROT_PICKUP_COLORS[i % CARROT_PICKUP_COLORS.length]);
    }
    // Upward gold sparkle ring
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const speed = 30 + Math.random() * 30;
      this.emitParticle(x, cy, Math.cos(angle) * speed, -50 - Math.random() * 40, 0.4 + Math.random() * 0.2, 1.5 + Math.random() * 2, '#FFD700');
    }
  }

  /** Apply visual effects (particles, screen shake/flash, haptics) for a hazard collision result. */
  applyHazardHitVFX(hit: HazardHitResult, playerId: PlayerSlot, state: MatchState, resimulating: boolean): void {
    // Screen effects (gated by resimulation)
    if (!resimulating) {
      if (hit.screenShake !== undefined) {
        state.screenShake = Math.max(state.screenShake, hit.screenShake);
      }
      if (hit.screenFlash !== undefined) {
        state.screenFlash = Math.max(state.screenFlash, hit.screenFlash);
      }
      if (hit.hitstopZoom !== undefined) {
        state.hitstopZoom = Math.max(state.hitstopZoom, hit.hitstopZoom);
      }
      // Haptics
      if (hit.haptic && haptics.isLocal(playerId)) {
        if (hit.haptic === 'spring') haptics.spring();
        else haptics.hazardHit();
      }
    }

    // Particles based on collision type
    const { px, py } = hit;
    switch (hit.type) {
      case 'thorn': {
        // Blood from player
        for (let i = 0; i < 18; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 60 + Math.random() * 160;
          const life = 0.4 + Math.random() * 0.5;
          this.emitParticle(px + (Math.random() - 0.5) * 8, py + (Math.random() - 0.5) * 8, Math.cos(angle) * speed, Math.sin(angle) * speed - 80, life, 2.5 + Math.random() * 4, BLOOD_COLOR);
        }
        // Thorn shrapnel
        if (hit.sx !== undefined && hit.sy !== undefined) {
          for (let i = 0; i < 8; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
            const speed = 30 + Math.random() * 80;
            const life = 0.3 + Math.random() * 0.3;
            this.emitParticle(hit.sx, hit.sy, Math.cos(angle) * speed, Math.sin(angle) * speed, life, 1.5 + Math.random() * 2, '#5C3A1E');
          }
        }
        break;
      }
      case 'hazardZone': {
        for (let i = 0; i < 24; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 80 + Math.random() * 200;
          const life = 0.4 + Math.random() * 0.6;
          const color = hit.hazardType === 'lava' ? (i % 3 === 0 ? '#FFCC00' : i % 3 === 1 ? '#FF4400' : '#FF8800') : BLOOD_COLOR;
          this.emitParticle(px + (Math.random() - 0.5) * 12, py + (Math.random() - 0.5) * 12, Math.cos(angle) * speed, Math.sin(angle) * speed - 100, life, 3 + Math.random() * 5, color);
        }
        break;
      }
      case 'ghost': {
        for (let i = 0; i < 20; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 60 + Math.random() * 160;
          const life = 0.4 + Math.random() * 0.5;
          const color = i % 2 === 0 ? '#8855CC' : '#AA77EE';
          this.emitParticle(px, py, Math.cos(angle) * speed, Math.sin(angle) * speed - 80, life, 3 + Math.random() * 4, color);
        }
        break;
      }
      case 'lavaRock': {
        for (let i = 0; i < 16; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 60 + Math.random() * 150;
          const life = 0.3 + Math.random() * 0.5;
          const color = i % 2 === 0 ? '#FF6600' : '#FFAA00';
          this.emitParticle(px, py, Math.cos(angle) * speed, Math.sin(angle) * speed - 60, life, 2.5 + Math.random() * 4, color);
        }
        break;
      }
      // spring, fallOff: no particles
    }
  }

  getParticles(): Particle[] {
    return this._particles;
  }

  /** Update weather, particles, gibs, confetti. */
  cosmeticUpdate(dt: number): void {
    updateWeather(this.state, this.theme, dt);
    updateParticles(this._particles, this.particleFreeList, this.arena.platforms, this.settings.goreMode, this.newBloodDripsSinceRender, dt);
    updateGibs(this.state.gibs, this.arena.platforms, this.arena.effectZones, this.geyserIndexMap, this.state.geyserStates, this.newGroundedGibsSinceRender, dt);
    updateConfetti(this.state.confetti, this.state.timeElapsed, dt);
  }

  /** Tick the firework spawn timer (called every frame on matchOver).
   *  Particle/gib/confetti motion is handled by cosmeticStep; calling
   *  updateParticles here would double-tick them and run at ~1.5× speed. */
  updateFireworks(dt: number): void {
    this.fireworkTimer -= dt;
    if (this.fireworkTimer <= 0) {
      this.fireworkTimer = 0.3;
      this.spawnFirework();
    }
  }

  /** Flush settled gibs and blood drips to the renderer background canvas. */
  bakeToRenderer(renderer: Renderer): void {
    if (this.newGroundedGibsSinceRender.length > 0) {
      renderer.bakeGibs(this.newGroundedGibsSinceRender);
      this.newGroundedGibsSinceRender.length = 0;
    }
    if (this.newBloodDripsSinceRender.length > 0) {
      renderer.renderBloodDrips(this.newBloodDripsSinceRender);
      this.newBloodDripsSinceRender.length = 0;
    }
  }

  cleanup(): void {
    this._particles.length = 0;
    this.particleFreeList.length = 0;
    this.newBloodDripsSinceRender.length = 0;
    this.newGroundedGibsSinceRender.length = 0;
  }
}
