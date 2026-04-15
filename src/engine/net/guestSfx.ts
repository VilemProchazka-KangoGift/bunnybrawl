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
import { SHOCKWAVE_MAX_RADIUS, SHOCKWAVE_DURATION, SPRING_TRAIL_DURATION } from '../constants';

interface PrevPlayerState {
  state: PlayerState;
  vy: number;
  sideSquash: number;
  burnTimer: number;
  footstepAccum: number; // accumulated walk time for footstep sounds
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
  update(state: MatchState, dt = 1 / 60): void {
    for (const player of state.players) {
      if (!player.active) continue;
      const prev = this.prevPlayers.get(player.id);

      if (prev) {
        // Stomp: player just got splatted
        if (prev.state !== 'splat' && prev.state !== 'respawning' && player.state === 'splat') {
          audio.play('stomp');
          audio.playAnimal(getCharacterForSlot(player.id).name);
          this.gameLoop.spawnStompVfxPublic(player);
          this.gameLoop.spawnGibsPublic(player);
          // Shockwave ring at victim position (not in snapshot, generated locally)
          state.shockwaves.push({
            x: player.x + player.width / 2,
            y: player.y + player.height / 2,
            radius: 0,
            maxRadius: SHOCKWAVE_MAX_RADIUS,
            life: SHOCKWAVE_DURATION,
          });
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

        // Respawn: respawning → idle
        if (prev.state === 'respawning' && player.state === 'idle') {
          audio.play('land');
        }

        // Push bump: sideSquash dropped to 0.8 (push) or 0.75 (wall)
        if (prev.sideSquash >= 0.95 && player.sideSquash < 0.85) {
          audio.play('bump');
        }

        // Burn damage: burnTimer went from 0 to > 0
        if (prev.burnTimer <= 0 && player.burnTimer > 0) {
          audio.play('oof');
        }

        // Geyser launch: sudden strong upward impulse (vy dropped by > 300 in one tick)
        if (prev.vy - player.vy > 300) {
          audio.play('geyser');
        }

        // Footsteps: accumulate walk time, play sound at intervals
        if (player.state === 'run') {
          prev.footstepAccum += dt;
          if (prev.footstepAccum > 0.22) { // ~4.5 steps/sec
            audio.play('land'); // reuse landing as soft footstep
            prev.footstepAccum = 0;
          }
        } else {
          prev.footstepAccum = 0;
        }
      }

      // Mutate in-place to avoid per-frame allocation
      if (prev) {
        prev.state = player.state;
        prev.vy = player.vy;
        prev.sideSquash = player.sideSquash;
        prev.burnTimer = player.burnTimer;
      } else {
        this.prevPlayers.set(player.id, {
          state: player.state, vy: player.vy,
          sideSquash: player.sideSquash, burnTimer: player.burnTimer,
          footstepAccum: 0,
        });
      }
    }

    // Carrots: active → inactive = pickup
    this.detectArrayTransition(
      this.prevCarrotActives, state.carrots.length,
      i => state.carrots[i].active,
      (prev, cur) => prev && !cur,
      i => { audio.play('crunch'); this.gameLoop.spawnCarrotVfxPublic(state.carrots[i].x, state.carrots[i].y); },
    );

    // Springs: bounceTimer went from 0 to >0
    this.detectArrayTransition(
      this.prevSpringBounces, state.springs.length,
      i => state.springs[i].bounceTimer,
      (prev, cur) => prev <= 0 && cur > 0,
      (i) => {
        audio.play('spring');
        // Set springTrailTimer on the nearest active player (not in snapshot)
        const sx = state.springs[i].x;
        const sy = state.springs[i].y;
        let closest: typeof state.players[0] | null = null;
        let minDist = 60; // only consider players within 60px of the spring
        for (const p of state.players) {
          if (!p.active || p.state === 'splat') continue;
          const dx = p.x + p.width / 2 - sx;
          const dy = p.y + p.height - sy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) { minDist = dist; closest = p; }
        }
        if (closest) closest.springTrailTimer = SPRING_TRAIL_DURATION;
      },
    );

    // Thorns: hit became true
    this.detectArrayTransition(
      this.prevThornHits, state.thorns.length,
      i => state.thorns[i].hit,
      (prev, cur) => !prev && cur,
      () => { audio.play('thornhit'); },
    );

    // Countdown
    if (state.countdown > 0) {
      const curSec = Math.ceil(state.countdown);
      if (curSec < this.prevCountdown) audio.play('countdown_beep');
      this.prevCountdown = curSec;
    } else if (this.prevCountdown > 0) {
      audio.play('countdown_go');
      this.prevCountdown = 0;
    }

    // Match over
    if (state.matchOver && !this.prevMatchOver) audio.play('victory');
    this.prevMatchOver = state.matchOver;
  }

  /** Generic array transition detector — compare previous vs current, fire callback on match. */
  private detectArrayTransition<T>(
    prevArr: T[], length: number,
    getCurrent: (i: number) => T,
    changed: (prev: T, cur: T) => boolean,
    onTrigger: (i: number) => void,
  ): void {
    for (let i = 0; i < length; i++) {
      const cur = getCurrent(i);
      if (i < prevArr.length && changed(prevArr[i], cur)) {
        onTrigger(i);
      }
      // Grow or update
      if (i >= prevArr.length) {
        prevArr.push(cur);
      } else {
        prevArr[i] = cur;
      }
    }
    prevArr.length = length;
  }
}
