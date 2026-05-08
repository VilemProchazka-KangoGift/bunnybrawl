import type { Arena, Player, PlayerSlot } from '../../types';
import {
  AFTERIMAGE_INTERVAL, AFTERIMAGE_SPEED_THRESHOLD, AFTERIMAGE_MAX,
} from '../../constants';
import { tickIdleStateMachine } from '../../rendering/idleActions';
import { audio } from '../../audio';
import { surfaceAt, swapRemove } from '../../themes/utils';
import { getSlowDevice } from '../../perfFlags';
import { SURFACE_PALETTE } from './surfacePalette';
import type { Accumulator } from '../../accumulator';

const FIRE_COLORS = ['#FF4400', '#FF8800', '#FFCC00', '#FFAA00'];

// Air-lean fades to 0 over ~0.7s — roughly the descent of a full jump.
const AIR_LEAN_DECAY_PER_S = 1.5;

/**
 * Update per-player cosmetic state: animation, fire particles, idle anim,
 * afterimages, footstep sounds, expressions, squash decay, fat wobble.
 * Called for each active player NOT in hitstop.
 */
export function updatePlayerCosmetics(
  player: Player, dt: number,
  effWalkSpeed: number,
  afterimageAccs: Accumulator<PlayerSlot>,
  footstepAccs: Accumulator<PlayerSlot>,
  emitParticle: (x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) => void,
  playSound: (name: string) => void,
  arena: Arena,
  inCountdown: boolean,
): void {
  // animFrame advance moved to Simulator.fixedUpdate — animFrame is in the
  // snapshot, so advancing it on guest's local clock (which drifts vs host)
  // overrode the snapshot value at non-deterministic times, causing visible
  // shake in the run cycle. animTimer stays local (cosmetic-only).
  if (player.state !== 'run') {
    player.animTimer = 0;
  }

  // Fast-fall smear fade-in/out. Ramps up while *visually* fast-falling (the
  // boolean stays true on a spring/geyser/stomp bounce if down is still held —
  // physics needs that for FAST_FALL_GRAVITY math — but the player is moving
  // upward, so cosmetically we should fade out). Ramps down faster on exit so
  // the smudge doesn't linger. Anchor capture lives in the renderer (per-frame)
  // to catch the transition without cosmeticStep's half-rate lag.
  // Local-only — not snapshotted.
  const activelyFastFalling = player.fastFalling && player.vy >= 0;
  if (activelyFastFalling) {
    player.fastFallStreakAlpha = Math.min(1, player.fastFallStreakAlpha + dt * 10);
  } else {
    player.fastFallStreakAlpha = Math.max(0, player.fastFallStreakAlpha - dt * 18);
  }

  // Air-lean budget. Walking off a platform never primes it (vy starts >= 0).
  if (player.state !== 'airborne' || player.fastFalling) {
    player.airLean = 0;
  } else if (player.vy < 0) {
    player.airLean = 1;
  } else {
    player.airLean = Math.max(0, player.airLean - dt * AIR_LEAN_DECAY_PER_S);
  }

  // Fire particles while burning
  if (player.burnTimer > 0 && player.state !== 'splat' && player.state !== 'respawning') {
    const cx = player.x + player.width / 2;
    const baseY = player.y + player.height;
    for (let i = 0; i < 2; i++) {
      const fx = cx + (Math.random() - 0.5) * player.width * 0.8;
      const fy = baseY - Math.random() * player.height * 0.6;
      const life = 0.25 + Math.random() * 0.3;
      emitParticle(fx, fy, (Math.random() - 0.5) * 40, -60 - Math.random() * 80, life, 2 + Math.random() * 4, FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)]);
    }
  }

  tickIdleStateMachine(player, dt, inCountdown);

  // Afterimages — spawn at speed threshold or during invincibility. Skipped on
  // slow-device; decay loop below still drains pre-existing entries.
  const speed = Math.max(Math.abs(player.vx), Math.abs(player.vy));
  const spawnAfterimage = !getSlowDevice()
    && (speed > AFTERIMAGE_SPEED_THRESHOLD || player.invincibleTimer > 0);
  if (spawnAfterimage) {
    let fired = afterimageAccs.advance(player.id, dt, AFTERIMAGE_INTERVAL);
    while (fired) {
      if (player.afterimages.length < AFTERIMAGE_MAX) {
        player.afterimages.push({ x: player.x, y: player.y, facing: player.facing, alpha: 1 });
      }
      fired = afterimageAccs.advance(player.id, 0, AFTERIMAGE_INTERVAL);
    }
  } else {
    afterimageAccs.clear(player.id);
  }
  // Decay afterimage alpha
  for (let i = player.afterimages.length - 1; i >= 0; i--) {
    player.afterimages[i].alpha -= dt * 4;
    if (player.afterimages[i].alpha <= 0) swapRemove(player.afterimages, i);
  }

  // Surface-aware footstep dispatch (sound + var-dust puff). Tempo,
  // volume, and puff size scale with |vx|.
  if (player.state === 'run') {
    const runSpeed = Math.abs(player.vx);
    const speedRatio = Math.min(runSpeed / effWalkSpeed, 1);
    const interval = 0.22 - speedRatio * 0.12;
    if (footstepAccs.advance(player.id, dt, interval)) {

      const cx = player.x + player.width / 2;
      const fy = player.y + player.height;
      const surface = surfaceAt(arena, cx, fy);
      const palette = SURFACE_PALETTE[surface];

      if (palette.footstepSound !== null) {
        audio.setVolume(palette.footstepSound, 0.08 + speedRatio * 0.2);
        playSound(palette.footstepSound);
      }

      if (!getSlowDevice()) {
        const color = palette.dust;
        const behind = player.facing === 'right' ? -1 : 1;
        const sx = cx + behind * (player.width * 0.3);
        const sy = fy - 1;
        const baseSize = 1 + speedRatio * 1.4;
        const baseLife = 0.16 + speedRatio * 0.12;

        if (surface === 'metal' || surface === 'glass') {
          // Sparks: smaller, faster, fewer.
          emitParticle(sx, sy, behind * (40 + speedRatio * 30), -30 - Math.random() * 30,
            baseLife * 0.7, 0.8 + Math.random() * 0.6, color);
        } else if (surface === 'ice') {
          if (Math.random() < 0.5) {
            emitParticle(sx, sy, behind * (12 + speedRatio * 12), -8 - Math.random() * 12,
              baseLife * 0.6, 0.6, color);
          }
        } else {
          emitParticle(sx, sy, behind * (20 + speedRatio * 30), -10 - Math.random() * 25,
            baseLife, baseSize, color);
        }
      }
    }
  } else {
    footstepAccs.clear(player.id);
  }

  // Expression overrides (dizzy/scared) moved to Simulator.fixedUpdate —
  // expression is in the snapshot, so overriding it on guest from
  // locally-decayed timers / interpolated vy could downgrade an authoritative
  // 'angry' (kill streak) to 'scared' mid-killstreak.

  // sideSquash decay moved to GameLoop.fixedUpdate (before collidePlatforms)
  // so end-of-tick state is the physics-authored value when wall-pressing,
  // not the post-decay value (which the half-rate cosmetic step left
  // alternating with the freshly-set 0.75 — visible as a 30Hz flicker).

  // Fat wobble moved to Simulator.fixedUpdate — squashScale is in the snapshot,
  // so applying it on both host and guest cosmeticStep compounded the wobble
  // and caused visible vibration on guests when fatPlayer mod was on.
}
