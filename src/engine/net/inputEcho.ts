/**
 * Input Echo: instant visual feedback for the guest's local player.
 *
 * Instead of predicting position (which causes rubber-banding), this system
 * overrides cosmetic-only properties based on raw local input. The character
 * LOOKS responsive because facing/animation/squash react instantly, while
 * the actual position comes from host snapshots via interpolation.
 *
 * Properties echoed: facing, animFrame, squashScale, sideSquash, fastFalling, expression.
 * Properties NEVER touched: x, y, vx, vy, state, timers, score, active.
 *
 * Disable with ?noecho URL param.
 */
import type { InputState, PlayerSlot, MatchState, Player } from '../types';

// Suppress echo for this long after state transitions (death, respawn)
const SUPPRESS_DURATION_MS = 200;
// Jump squash anticipation duration
const JUMP_SQUASH_DURATION = 0.08; // 80ms
const JUMP_SQUASH_SCALE = 0.85;
// Direction reversal squash
const REVERSAL_SQUASH_DURATION = 0.05; // 50ms
const REVERSAL_SQUASH_SCALE = 0.9;

export class InputEcho {
  readonly localSlot: PlayerSlot;

  // Echo state
  private echoFacing: 'left' | 'right' | null = null;
  private facingLockUntil = 0;
  private walkCycleFrame = 0;
  private animLockUntil = 0;
  private jumpSquashTimer = 0;
  private reversalSquashTimer = 0;

  // Edge detection
  private prevInput: InputState = { left: false, right: false, jump: false, down: false };
  private prevFacing: 'left' | 'right' | null = null;
  private prevX = 0;
  private hasPrevX = false;

  // Suppression (during death/respawn/teleport)
  private suppressedUntil = 0;
  private prevState: string = '';

  constructor(localSlot: PlayerSlot) {
    this.localSlot = localSlot;
  }

  /**
   * Apply input echo overrides to the local player's visual properties.
   * Call after applySnapshotToState() and before renderFrame().
   * Mutates the player object in-place.
   */
  apply(input: InputState, state: MatchState, rtt: number, dt: number): void {
    const player = state.players.find(p => p.id === this.localSlot);
    if (!player || !player.active) return;

    const now = performance.now();

    // Suppress echo during death/respawn transitions
    if (player.state === 'splat' || player.state === 'respawning') {
      if (this.prevState !== 'splat' && this.prevState !== 'respawning') {
        this.reset(now);
      }
      this.prevState = player.state;
      this.copyInput(input);
      return;
    }

    // Detect large position discontinuity (respawn teleport) — reset echo
    if (this.hasPrevX && Math.abs(player.x - this.prevX) > 100) {
      this.reset(now);
    }
    this.prevX = player.x;
    this.hasPrevX = true;

    if (now < this.suppressedUntil) {
      this.prevState = player.state;
      this.copyInput(input);
      return;
    }

    // Decay timers
    this.jumpSquashTimer = Math.max(0, this.jumpSquashTimer - dt);
    this.reversalSquashTimer = Math.max(0, this.reversalSquashTimer - dt);

    const lockDuration = rtt + 50;

    this.applyFacing(input, player, now, lockDuration);
    this.applyAnimation(input, player, now, lockDuration, dt);
    this.applyJumpSquash(input, player);
    this.applyReversalSquash(input, player);
    this.applyFastFall(input, player);
    this.applyExpression(input, player);

    // Store for next frame edge detection
    this.prevState = player.state;
    this.copyInput(input);
  }

  private copyInput(input: InputState): void {
    this.prevInput.left = input.left;
    this.prevInput.right = input.right;
    this.prevInput.jump = input.jump;
    this.prevInput.down = input.down;
  }

  /** Reset all echo state (called on death, respawn, teleport). */
  reset(now?: number): void {
    this.echoFacing = null;
    this.facingLockUntil = 0;
    this.walkCycleFrame = 0;
    this.animLockUntil = 0;
    this.jumpSquashTimer = 0;
    this.reversalSquashTimer = 0;
    this.prevFacing = null;
    this.hasPrevX = false;
    this.suppressedUntil = (now ?? performance.now()) + SUPPRESS_DURATION_MS;
  }

  // ---- Individual echo applications ----

  private applyFacing(input: InputState, player: Player, now: number, lockDuration: number): void {
    if (input.left) {
      player.facing = 'left';
      this.echoFacing = 'left';
      this.facingLockUntil = now + lockDuration;
    } else if (input.right) {
      player.facing = 'right';
      this.echoFacing = 'right';
      this.facingLockUntil = now + lockDuration;
    } else if (now < this.facingLockUntil && this.echoFacing) {
      // During lock period, maintain echoed facing (override snapshot)
      player.facing = this.echoFacing;
    }
    // After lock expires with no input: snapshot facing takes over naturally
  }

  private applyAnimation(input: InputState, player: Player, now: number, lockDuration: number, dt: number): void {
    if ((input.left || input.right) && (player.state === 'idle' || player.state === 'run')) {
      // Locally drive walk cycle (frame-rate independent)
      this.walkCycleFrame += dt * 60;
      player.animFrame = Math.floor(this.walkCycleFrame);
      this.animLockUntil = now + lockDuration;
    } else if (now < this.animLockUntil) {
      // During lock, keep the local anim frame (don't let snapshot reset to idle)
      player.animFrame = this.walkCycleFrame;
    } else {
      // Lock expired, no movement input — reset local cycle
      this.walkCycleFrame = 0;
    }
  }

  private applyJumpSquash(input: InputState, player: Player): void {
    // Rising edge: jump pressed this frame but not last
    if (input.jump && !this.prevInput.jump) {
      this.jumpSquashTimer = JUMP_SQUASH_DURATION;
    }
    if (this.jumpSquashTimer > 0) {
      player.squashScale = JUMP_SQUASH_SCALE;
    }
  }

  private applyReversalSquash(input: InputState, player: Player): void {
    const curFacing = input.left ? 'left' : input.right ? 'right' : null;
    if (curFacing && this.prevFacing && curFacing !== this.prevFacing) {
      this.reversalSquashTimer = REVERSAL_SQUASH_DURATION;
    }
    if (curFacing) this.prevFacing = curFacing;

    if (this.reversalSquashTimer > 0) {
      player.sideSquash = REVERSAL_SQUASH_SCALE;
    }
  }

  private applyFastFall(input: InputState, player: Player): void {
    if (input.down && player.state === 'airborne') {
      player.fastFalling = true;
    }
  }

  private applyExpression(input: InputState, player: Player): void {
    if (input.down && player.vy > 200) {
      player.expression = 'scared';
    }
  }
}
