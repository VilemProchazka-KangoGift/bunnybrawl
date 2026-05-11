import type { MatchState, MatchSettings, Player, PlayerSlot } from '../../types';
import type { CosmeticSystem } from '../types';
import type { ParticleSystem } from './ParticleSystem';
import { PlayerSfxCooldowns } from './sfx';
import {
  detectPlayerTransitions,
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

  /** Per-slot pool of PrevPlayerCosmeticState scratches. The tracker stores
   *  these references as its prev-baseline, and the snapshot fn mutates them
   *  in place rather than allocating fresh objects every detect. Pre-pool sits
   *  on the system, not on the tracker, so the tracker stays single-source-of-
   *  truth-keyed and the pool key matches the tracker key (slot). */
  private readonly _scratchPrev: Map<PlayerSlot, PrevPlayerCosmeticState> = new Map();
  private readonly _snapshotPooled = (player: Player): PrevPlayerCosmeticState => {
    let p = this._scratchPrev.get(player.id);
    if (!p) {
      p = {
        state: 'idle', vx: 0, vy: 0, score: 0,
        fatTimer: 0, sideSquash: 1,
        burnTimer: 0, slowTimer: 0, invincibleTimer: 0,
        fastFalling: false, springTrailTimer: 0,
      };
      this._scratchPrev.set(player.id, p);
    }
    p.state = player.state;
    p.vx = player.vx;
    p.vy = player.vy;
    p.score = player.score;
    p.fatTimer = player.fatTimer;
    p.sideSquash = player.sideSquash;
    p.burnTimer = player.burnTimer;
    p.slowTimer = player.slowTimer;
    p.invincibleTimer = player.invincibleTimer;
    p.fastFalling = player.fastFalling;
    p.springTrailTimer = player.springTrailTimer;
    return p;
  };
  private readonly tracker: TransitionTracker<PlayerSlot, PrevPlayerCosmeticState, Player> =
    new TransitionTracker<PlayerSlot, PrevPlayerCosmeticState, Player>(this._snapshotPooled);
  /** Stable callback bound at construction. Reads `_currentPlayer` (set before
   *  each detect call) instead of capturing per-player, so the cosmeticUpdate
   *  loop doesn't allocate a fresh arrow per slot per frame. */
  private _currentPlayer: Player | null = null;
  private readonly _onPlayerTransition = (prev: PrevPlayerCosmeticState): void => {
    const p = this._currentPlayer;
    if (p) detectPlayerTransitions(p, prev, this.state, this.sfxCooldowns, this.callbacks);
  };
  private sfxCooldowns: PlayerSfxCooldowns = new PlayerSfxCooldowns();
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

      // SFX cooldown decay (must tick even during hitstop so cooldowns don't accumulate).
      // This is the ONE central decay site — consume sites use isReady() (read-only).
      this.sfxCooldowns.decay(player.id, dt);

      // Cosmetic timer decay (runs even during hitstop for smooth visuals)
      if (player.damageFlashTimer > 0) player.damageFlashTimer = Math.max(0, player.damageFlashTimer - dt);
      if (player.springTrailTimer > 0) player.springTrailTimer = Math.max(0, player.springTrailTimer - dt);

      // Transition-triggered effects (must fire even during hitstop, e.g. stomp).
      // Tracker fires onTransition only after a baseline exists, then
      // re-snapshots player as the next-frame baseline.
      this._currentPlayer = player;
      this.tracker.detect(player.id, player, this._onPlayerTransition);
      this._currentPlayer = null;
    }
  }

  /** Exposes sfxCooldowns for GameLoop's fixedUpdate (headbonk + crouch cooldowns). */
  getSfxCooldowns(): PlayerSfxCooldowns {
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
