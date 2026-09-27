import type { MatchState, MatchSettings, Arena, Particle, ParticleShape, Gib, ConfettiParticle, Player, PlayerSlot, EffectZone } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import type { CosmeticSystem } from '../types';
import type { HazardHitResult } from '../gameplay/playerCollisions';
import type { IRenderer } from '../../renderer';
import type { ParticleEmitter } from '../../simulator/types';
import { BLOOD_COLOR, CARROT_SIZE } from '../../constants';
import { haptics } from '../../haptics';
import { emitParticle as _emitParticle, spawnDustParticles as _spawnDustParticles, spawnJumpDustParticles as _spawnJumpDustParticles, spawnGoreParticles as _spawnGoreParticles, spawnConfetti as _spawnConfetti, spawnCarrotVFX as _spawnCarrotVFX, spawnRingVFX as _spawnRingVFX, spawnFirework as _spawnFirework, updateParticles, updateConfetti } from './particles';
import { launchGib, spawnGibs, updateGibs, GIB_FREELIST_CAP } from './gibs';
import { updateWeather } from './environment';

const CARROT_PICKUP_COLORS = ['#FF8C00', '#FF6600', '#FFA500', '#FF7700', '#FFD700', '#FF8C00'];

export class ParticleSystem implements CosmeticSystem, ParticleEmitter {
  private state: MatchState;
  private arena: Arena;
  private theme: ThemeConfig;
  private settings: MatchSettings;

  private _particles: Particle[] = [];
  private particleFreeList: Particle[] = [];
  /** Pool of dead Gibs reused across kills to avoid GC churn. Refilled from
   *  three sources: mid-air expiration, airborne-cap eviction, and post-bake
   *  recycling. Capped at GIB_FREELIST_CAP. */
  private gibFreeList: Gib[] = [];
  /** Pool of dead Confetti reused across kills (non-gore kill VFX). */
  private confettiFreeList: ConfettiParticle[] = [];
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
    // Pre-warm the pools so the first kill / dust burst doesn't allocate.
    // Sized to cover a representative kill burst (gibs ~40, particles ~100,
    // confetti ~30); beyond that, on-demand allocation is acceptable.
    for (let i = 0; i < 200; i++) {
      this.particleFreeList.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: '', shape: undefined });
    }
    for (let i = 0; i < 100; i++) {
      this.gibFreeList.push({
        x: 0, y: 0, vx: 0, vy: 0, rotation: 0, rotationSpeed: 0,
        width: 0, height: 0, color: '', darkColor: '', lightColor: '',
        characterName: '', gibType: 'body', bounced: false, life: 0,
      });
    }
    for (let i = 0; i < 30; i++) {
      this.confettiFreeList.push({
        x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0,
        color: '', shape: 'circle', rotation: 0, rotationSpeed: 0, flutter: 0,
      });
    }
  }

  init(): void {}

  emitParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, shape?: ParticleShape): void {
    _emitParticle(this._particles, this.particleFreeList, x, y, vx, vy, life, size, color, shape);
  }

  spawnDustParticles(player: Player, landVy: number): void {
    _spawnDustParticles(this._particles, this.particleFreeList, player, landVy, this.theme.ground.surfaceColor);
  }

  spawnJumpDustParticles(player: Player): void {
    _spawnJumpDustParticles(this._particles, this.particleFreeList, player);
  }

  spawnGoreParticles(victim: Player, extremeGore: boolean): void {
    _spawnGoreParticles(this._particles, this.particleFreeList, victim, extremeGore);
  }

  spawnConfettiVFX(victim: Player): void {
    _spawnConfetti(this.state.confetti, this.confettiFreeList, victim);
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
    spawnGibs(this.state.gibs, this.gibFreeList, victim, settings);
    if (!settings.goreMode) {
      _spawnConfetti(this.state.confetti, this.confettiFreeList, victim);
    }
  }

  /** Orchestration: connects gib launcher + particle emitter for carrot pickup. */
  pickupCarrotVFX(x: number, y: number): void {
    const cy = y + CARROT_SIZE / 2;
    // Orange carrot chunks
    for (let i = 0; i < 4; i++) {
      const s = 4 + Math.random() * 3;
      launchGib(this.state.gibs, this.gibFreeList, x, cy, 10, 0.15, 0.85, 80, 200, s, s, '#FF8C00', '#CC6600', '#FFB040', '', 'body');
    }
    // Green leaf pieces
    for (let i = 0; i < 2; i++) {
      launchGib(this.state.gibs, this.gibFreeList, x, cy, 8, 0.2, 0.8, 60, 160, 5, 3, '#4CAF50', '#2E7D32', '#81C784', '', 'body');
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
        if (!resimulating) {
          state.screenFlash = Math.max(state.screenFlash, 0.18);
        }
        // Blood droplets — emitted as spikes so they read as elongated splatter
        // streaks rather than round dots. Velocity-aligned via the 'spike' shape.
        for (let i = 0; i < 18; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 90 + Math.random() * 180;
          const life = 0.4 + Math.random() * 0.5;
          this.emitParticle(px + (Math.random() - 0.5) * 8, py + (Math.random() - 0.5) * 8, Math.cos(angle) * speed, Math.sin(angle) * speed - 80, life, 2 + Math.random() * 3, BLOOD_COLOR, 'spike');
        }
        if (hit.sx !== undefined && hit.sy !== undefined) {
          // Wood barb fragments — bias upward (away from the spike).
          for (let i = 0; i < 14; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
            const speed = 90 + Math.random() * 160;
            const life = 0.3 + Math.random() * 0.4;
            const color = i % 2 === 0 ? '#5C3A1E' : '#3A2210';
            this.emitParticle(hit.sx, hit.sy, Math.cos(angle) * speed, Math.sin(angle) * speed, life, 1.4 + Math.random() * 1.8, color, 'spike');
          }
          // Slow blood drip from the thorn tip.
          this.emitParticle(hit.sx, hit.sy, 0, 30, 1.0, 1.8, BLOOD_COLOR);
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
      case 'spring': {
        // Small upward fan of yellow spikes — release energy, kept subtle so it
        // doesn't compete with the player's launch motion.
        for (let i = 0; i < 8; i++) {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.0;
          const speed = 100 + Math.random() * 120;
          const life = 0.2 + Math.random() * 0.2;
          const color = i % 2 === 0 ? '#FFD43A' : '#FFA800';
          this.emitParticle(px, py, Math.cos(angle) * speed, Math.sin(angle) * speed, life, 1.2 + Math.random() * 1.2, color, 'spike');
        }
        break;
      }
      case 'fallOff':
        // No particles — handled by spawnKillSplatter elsewhere.
        break;
    }
  }

  getParticles(): Particle[] {
    return this._particles;
  }

  /** Update weather, particles, gibs, confetti. */
  cosmeticUpdate(dt: number): void {
    updateWeather(this.state, this.theme, dt);
    updateParticles(this._particles, this.particleFreeList, this.arena.platforms, this.settings.goreMode, this.newBloodDripsSinceRender, dt);
    updateGibs(this.state.gibs, this.gibFreeList, this.arena.platforms, this.arena.effectZones, this.geyserIndexMap, this.state.geyserStates, this.newGroundedGibsSinceRender, dt);
    updateConfetti(this.state.confetti, this.confettiFreeList, this.state.timeElapsed, dt);
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
  bakeToRenderer(renderer: IRenderer): void {
    if (this.newGroundedGibsSinceRender.length > 0) {
      renderer.bakeGibs(this.newGroundedGibsSinceRender);
      // bakeGibs copies the gibs into the bg canvas; the source objects are dead
      // after this returns. Recycle up to GIB_FREELIST_CAP; the rest go to GC.
      for (let i = 0; i < this.newGroundedGibsSinceRender.length; i++) {
        if (this.gibFreeList.length >= GIB_FREELIST_CAP) break;
        this.gibFreeList.push(this.newGroundedGibsSinceRender[i]);
      }
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
