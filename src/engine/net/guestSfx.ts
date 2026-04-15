/**
 * Guest-side sound effects and particle emission.
 *
 * The guest never calls fixedUpdate(), so it never triggers playSound() or
 * emitParticle(). This module watches for state transitions in applied
 * snapshots and fires the corresponding audio + visual effects locally.
 */
import type { MatchState, PlayerSlot, PlayerState } from '../types';
import { audio } from '../audio';
import type { GameLoop } from '../gameLoop';
import { getCharacterForSlot } from '../characters';

interface PrevPlayerState {
  state: PlayerState;
  vy: number;
  score: number;
}

export class GuestSFX {
  private prevPlayers = new Map<PlayerSlot, PrevPlayerState>();
  private prevCarrotActives: boolean[] = [];
  private prevSpringBounces: number[] = [];
  private prevThornHits: boolean[] = [];
  private prevCountdown = 4;
  private prevMatchOver = false;
  private gameLoop: GameLoop;

  constructor(gameLoop: GameLoop) {
    this.gameLoop = gameLoop;
  }

  /** Call after applying snapshot to MatchState. Detects transitions and fires SFX + particles. */
  update(state: MatchState): void {
    // --- Player transitions ---
    for (const player of state.players) {
      if (!player.active) continue;
      const prev = this.prevPlayers.get(player.id);

      if (prev) {
        // Stomp: player just got splatted
        if (prev.state !== 'splat' && prev.state !== 'respawning' && player.state === 'splat') {
          audio.play('stomp');
          const charDef = getCharacterForSlot(player.id);
          audio.playAnimal(charDef.name);
          this.gameLoop.spawnStompVfxPublic(player);
        }

        // Landing: airborne → grounded
        if (prev.state === 'airborne' && (player.state === 'idle' || player.state === 'run')) {
          audio.play('land');
          this.gameLoop.spawnDustPublic(player, Math.abs(prev.vy));
        }

        // Jump: grounded → airborne
        if ((prev.state === 'idle' || prev.state === 'run') && player.state === 'airborne') {
          audio.play('jump');
        }
      }

      // Store for next frame
      this.prevPlayers.set(player.id, {
        state: player.state,
        vy: player.vy,
        score: player.score,
      });
    }

    // --- Carrots: active → inactive = pickup ---
    for (let i = 0; i < state.carrots.length; i++) {
      const wasActive = this.prevCarrotActives[i] ?? true;
      if (wasActive && !state.carrots[i].active) {
        audio.play('crunch');
        this.gameLoop.spawnCarrotVfxPublic(state.carrots[i].x, state.carrots[i].y);
      }
    }
    this.prevCarrotActives.length = state.carrots.length;
    for (let i = 0; i < state.carrots.length; i++) {
      this.prevCarrotActives[i] = state.carrots[i].active;
    }

    // --- Springs: bounceTimer went from 0 to >0 ---
    for (let i = 0; i < state.springs.length; i++) {
      const prevBounce = this.prevSpringBounces[i] ?? 0;
      if (prevBounce <= 0 && state.springs[i].bounceTimer > 0) {
        audio.play('spring');
      }
    }
    this.prevSpringBounces.length = state.springs.length;
    for (let i = 0; i < state.springs.length; i++) {
      this.prevSpringBounces[i] = state.springs[i].bounceTimer;
    }

    // --- Thorns: hit became true ---
    for (let i = 0; i < state.thorns.length; i++) {
      const wasHit = this.prevThornHits[i] ?? false;
      if (!wasHit && state.thorns[i].hit) {
        audio.play('thornhit');
      }
    }
    this.prevThornHits.length = state.thorns.length;
    for (let i = 0; i < state.thorns.length; i++) {
      this.prevThornHits[i] = state.thorns[i].hit;
    }

    // --- Countdown ---
    if (state.countdown > 0) {
      const curSec = Math.ceil(state.countdown);
      if (curSec < this.prevCountdown) {
        audio.play('countdown_beep');
      }
      this.prevCountdown = curSec;
    } else if (this.prevCountdown > 0) {
      audio.play('countdown_go');
      this.prevCountdown = 0;
    }

    // --- Match over ---
    if (state.matchOver && !this.prevMatchOver) {
      audio.play('victory');
    }
    this.prevMatchOver = state.matchOver;
  }
}
