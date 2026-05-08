import type { MatchState, MatchSettings, Player, PlayerSlot } from '../../types';
import type { CosmeticSystem } from '../types';
import type { ParticleSystem } from './ParticleSystem';
import type { SfxCooldowns } from './sfx';
import { decaySfxCooldowns } from './sfx';
import {
  detectPlayerTransitions,
  snapshotPlayerCosmeticState,
} from './playerTransitions';
import type { PrevPlayerCosmeticState, TransitionCallbacks } from './playerTransitions';
import { getSlowDevice } from '../../perfFlags';
import { TransitionTracker } from '../../transitionTracker';

export class PlayerTransitionSystem implements CosmeticSystem {
  private state: MatchState;
  private settings: MatchSettings;
  private playSound: (name: string) => void;
  private playAnimal: (name: string) => void;
  private particleSystem: ParticleSystem;

  private readonly tracker: TransitionTracker<PlayerSlot, PrevPlayerCosmeticState, Player> =
    new TransitionTracker<PlayerSlot, PrevPlayerCosmeticState, Player>(snapshotPlayerCosmeticState);
  private sfxCooldowns: Map<PlayerSlot, SfxCooldowns> = new Map();
  private callbacks: TransitionCallbacks;

  constructor(
    state: MatchState,
    settings: MatchSettings,
    playSound: (name: string) => void,
    playAnimal: (name: string) => void,
    particleSystem: ParticleSystem,
    onStomp?: (x: number, y: number) => void,
    lightBurst?: (x: number, y: number, kind: 'spawn' | 'stomp') => void,
  ) {
    this.state = state;
    this.settings = settings;
    this.playSound = playSound;
    this.playAnimal = playAnimal;
    this.particleSystem = particleSystem;

    this.callbacks = {
      playSound: this.playSound,
      playAnimal: this.playAnimal,
      spawnDustParticles: (p, vy) => this.particleSystem.spawnDustParticles(p, vy),
      spawnJumpDustParticles: (p) => { if (!getSlowDevice()) this.particleSystem.spawnJumpDustParticles(p); },
      spawnKillSplatter: (v) => this.particleSystem.spawnKillSplatter(v, this.settings),
      pickupCarrotVFX: (x, y) => this.particleSystem.pickupCarrotVFX(x, y),
      spawnPlayerSpawnVFX: (x, y) => this.particleSystem.spawnRingVFX(x, y),
      onStomp,
      lightBurst,
    };
  }

  init(): void {
    for (const p of this.state.players) {
      this.tracker.prime(p.id, p);
      if (p.active && p.state !== 'splat' && p.state !== 'respawning') {
        this.callbacks.spawnPlayerSpawnVFX(p.x + p.width / 2, p.y + p.height / 2);
      }
    }
  }

  cosmeticUpdate(dt: number): void {
    for (const player of this.state.players) {
      if (!player.active) continue;

      // SFX cooldown decay (must tick even during hitstop so cooldowns don't accumulate)
      decaySfxCooldowns(this.sfxCooldowns, player.id, dt);

      // Cosmetic timer decay (runs even during hitstop for smooth visuals)
      if (player.damageFlashTimer > 0) player.damageFlashTimer = Math.max(0, player.damageFlashTimer - dt);
      if (player.springTrailTimer > 0) player.springTrailTimer = Math.max(0, player.springTrailTimer - dt);

      // Transition-triggered effects (must fire even during hitstop, e.g. stomp).
      // Tracker fires onTransition only after a baseline exists, then
      // re-snapshots player as the next-frame baseline.
      this.tracker.detect(player.id, player, (prev) => {
        detectPlayerTransitions(player, prev, this.state, this.sfxCooldowns, this.callbacks);
      });
    }
  }

  /** Exposes sfxCooldowns for GameLoop's fixedUpdate (headbonk + crouch cooldowns). */
  getSfxCooldowns(): Map<PlayerSlot, SfxCooldowns> {
    return this.sfxCooldowns;
  }

  /** Re-prime per-player baselines against current state. Used when the
   *  guest reconnects (snapshots resume from a different state, so a stale
   *  baseline would fire spurious jump/land/score-anim SFX) or on the
   *  loading→playing edge (initial baseline was captured before the host's
   *  countdown advanced). */
  resetBaseline(): void {
    this.tracker.clear();
    for (const p of this.state.players) {
      this.tracker.prime(p.id, p);
    }
  }

  cleanup(): void {
    this.tracker.clear();
    this.sfxCooldowns.clear();
  }
}
