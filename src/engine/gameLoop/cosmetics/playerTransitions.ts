import type { Player, PlayerSlot, PlayerState, MatchState } from '../../types';
import { DUST_LAND_VY_THRESHOLD, SHOCKWAVE_MAX_RADIUS, SHOCKWAVE_DURATION, SCORE_ANIM_DURATION } from '../../constants';
import { haptics } from '../../haptics';
import type { SfxCooldowns } from './sfx';
import { getOrCreateCooldowns } from './sfx';

/** Previous-frame player state for cosmetic transition detection. */
export interface PrevPlayerCosmeticState {
  state: PlayerState;
  vx: number;
  vy: number;
  score: number;
  fatTimer: number;
  sideSquash: number;
  burnTimer: number;
  slowTimer: number;
  invincibleTimer: number;
  fastFalling: boolean;
  springTrailTimer: number;
}

export function snapshotPlayerCosmeticState(player: Player): PrevPlayerCosmeticState {
  return {
    state: player.state, vx: player.vx, vy: player.vy,
    score: player.score, fatTimer: player.fatTimer, sideSquash: player.sideSquash,
    burnTimer: player.burnTimer, slowTimer: player.slowTimer,
    invincibleTimer: player.invincibleTimer,
    fastFalling: player.fastFalling,
    springTrailTimer: player.springTrailTimer,
  };
}

/** Callbacks for side effects that cross module boundaries. */
export interface TransitionCallbacks {
  playSound: (name: string) => void;
  playAnimal: (characterName: string) => void;
  spawnDustParticles: (player: Player, landVy: number) => void;
  spawnJumpDustParticles: (player: Player) => void;
  spawnKillSplatter: (victim: Player) => void;
  pickupCarrotVFX: (x: number, y: number) => void;
  spawnPlayerSpawnVFX: (x: number, y: number) => void;
  /** Optional: fired when a player transitions to 'splat' (stomp landing).
   *  Receives the stomp position (victim's center). Used by
   *  ReactiveDecorationSystem to shake nearby trees / saplings. */
  onStomp?: (x: number, y: number) => void;
}

/**
 * Detect per-player state transitions and fire sounds/VFX.
 * Must fire even during hitstop (e.g. stomp sound).
 * Mutates `prev` in place to track frame-to-frame changes.
 */
export function detectPlayerTransitions(
  player: Player,
  prev: PrevPlayerCosmeticState,
  state: MatchState,
  sfxCooldowns: Map<PlayerSlot, SfxCooldowns>,
  cb: TransitionCallbacks,
): void {
  const wasGrounded = prev.state === 'idle' || prev.state === 'run';
  const wasAirborne = prev.state === 'airborne';
  const isAirborne = player.state === 'airborne';
  const isGrounded = player.state === 'idle' || player.state === 'run';

  // Jump: grounded → airborne
  if (wasGrounded && isAirborne) {
    cb.playSound('jump');
    // Jump dust fires only on input-jump — exclude spring launches
    // (springTrailTimer rising edge: was 0 last tick, now > 0).
    // Note: springLaunchX/Y are set at the spring's coords by handleSpringCollision
    // (host) and entityTransitions (guest), not here — this runs at half-rate
    // after physics has already moved the player off the spring.
    const sprangThisTick = prev.springTrailTimer === 0 && player.springTrailTimer > 0;
    if (!sprangThisTick) {
      cb.spawnJumpDustParticles(player);
    }
  }

  // Fast-fall start
  if (!prev.fastFalling && player.fastFalling) cb.playSound('fastfall');

  // Landing: airborne → grounded
  if (wasAirborne && isGrounded && Math.abs(prev.vy) >= DUST_LAND_VY_THRESHOLD) {
    const cd = getOrCreateCooldowns(sfxCooldowns, player.id);
    if (cd.land <= 0) {
      cb.playSound('land');
      cd.land = 0.1;
    }
    cb.spawnDustParticles(player, Math.abs(prev.vy));
  }

  // Wall hit: was moving fast horizontally, now stopped
  if (Math.abs(prev.vx) > 100 && Math.abs(player.vx) < 5 && isGrounded) cb.playSound('oof');

  // Stomp: alive → splat (but not disconnect — disconnectPlayer sets splat directly)
  if (prev.state !== 'splat' && prev.state !== 'respawning' && player.state === 'splat' && !player.disconnected) {
    cb.playSound('stomp');
    cb.playAnimal(player.character.name);
    cb.spawnKillSplatter(player);
    state.shockwaves.push({
      x: player.x + player.width / 2, y: player.y + player.height / 2,
      radius: 0, maxRadius: SHOCKWAVE_MAX_RADIUS, life: SHOCKWAVE_DURATION,
    });
    if (cb.onStomp) cb.onStomp(player.x + player.width / 2, player.y + player.height / 2);
  }

  // Respawn (any path: stomp, fall-off, OOB failsafe). invincibleTimer rises
  // non-zero only via respawnPlayer / handleFallOff — both are spawn moments.
  // Game start is handled separately by PlayerTransitionSystem.init().
  if (player.invincibleTimer > prev.invincibleTimer) {
    cb.playSound('land');
    cb.spawnPlayerSpawnVFX(player.x + player.width / 2, player.y + player.height / 2);
  }

  // Push bump (sideSquash === 0.8 is exact collision marker; wall hits set 0.75)
  if (prev.sideSquash >= 0.95 && Math.abs(player.sideSquash - 0.8) < 0.01) {
    cb.playSound('bump');
    if (haptics.isLocal(player.id)) haptics.bump();
  }

  // Burn start
  if (prev.burnTimer <= 0 && player.burnTimer > 0) cb.playSound('oof');

  // Score change → score animation (any source: carrot, stomp kill, etc.)
  if (player.score > prev.score) {
    state.scoreAnimations.push({ playerId: player.id, value: player.score - prev.score, timer: SCORE_ANIM_DURATION });
  }

  // Carrot pickup → crunch + animal sound + pickup VFX. Detected via fatTimer
  // jump (carrot pickup is the only path that sets fatTimer non-decreasingly).
  if (player.fatTimer > prev.fatTimer) {
    cb.playSound('crunch');
    cb.playAnimal(player.character.name);
    cb.pickupCarrotVFX(player.x + player.width / 2, player.y);
  }

  // Slow start → thorn/hazard/ghost/lava rock hit sound
  if (prev.slowTimer <= 0 && player.slowTimer > 0) cb.playSound('thornhit');

  // Update prev state
  prev.state = player.state;
  prev.vx = player.vx;
  prev.vy = player.vy;
  prev.score = player.score;
  prev.fatTimer = player.fatTimer;
  prev.sideSquash = player.sideSquash;
  prev.burnTimer = player.burnTimer;
  prev.invincibleTimer = player.invincibleTimer;
  prev.slowTimer = player.slowTimer;
  prev.fastFalling = player.fastFalling;
  prev.springTrailTimer = player.springTrailTimer;
}
