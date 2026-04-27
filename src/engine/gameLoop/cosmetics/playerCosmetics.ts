import type { Player, PlayerSlot } from '../../types';
import {
  ANIM_FRAME_DURATION, RUN_FRAMES, IDLE_ANIM_INTERVAL,
  AFTERIMAGE_INTERVAL, AFTERIMAGE_SPEED_THRESHOLD, AFTERIMAGE_MAX,
} from '../../constants';
import { audio } from '../../audio';
import { swapRemove } from '../../themes/utils';
import { fastSin } from '../../fastMath';

const f = Math.fround;
const FIRE_COLORS = ['#FF4400', '#FF8800', '#FFCC00', '#FFAA00'];

/**
 * Update per-player cosmetic state: animation, fire particles, idle anim,
 * afterimages, footstep sounds, expressions, squash decay, fat wobble.
 * Called for each active player NOT in hitstop.
 */
export function updatePlayerCosmetics(
  player: Player, dt: number, timeElapsed: number,
  effWalkSpeed: number,
  afterimageAccs: Map<PlayerSlot, number>,
  footstepAccs: Map<PlayerSlot, number>,
  emitParticle: (x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) => void,
  playSound: (name: string) => void,
): void {
  // Animation frame advance
  player.animTimer += dt;
  if (player.animTimer >= ANIM_FRAME_DURATION) {
    player.animTimer -= ANIM_FRAME_DURATION;
    player.animFrame = (player.animFrame + 1) % RUN_FRAMES;
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

  // Idle animation timer
  if (player.state === 'idle') {
    player.idleAnimTimer += dt;
    if (player.idleAnimTimer >= IDLE_ANIM_INTERVAL) player.idleAnimTimer = 0;
  } else {
    player.idleAnimTimer = 0;
  }

  // Afterimages — spawn at speed threshold or during invincibility
  const speed = Math.max(Math.abs(player.vx), Math.abs(player.vy));
  const spawnAfterimage = speed > AFTERIMAGE_SPEED_THRESHOLD || player.invincibleTimer > 0;
  if (spawnAfterimage) {
    let acc = afterimageAccs.get(player.id) || 0;
    acc += dt;
    while (acc >= AFTERIMAGE_INTERVAL) {
      acc -= AFTERIMAGE_INTERVAL;
      if (player.afterimages.length < AFTERIMAGE_MAX) {
        player.afterimages.push({ x: player.x, y: player.y, facing: player.facing, alpha: 1 });
      }
    }
    afterimageAccs.set(player.id, acc);
  } else {
    afterimageAccs.set(player.id, 0);
  }
  // Decay afterimage alpha
  for (let i = player.afterimages.length - 1; i >= 0; i--) {
    player.afterimages[i].alpha -= dt * 4;
    if (player.afterimages[i].alpha <= 0) swapRemove(player.afterimages, i);
  }

  // Footstep sounds — interval and volume scale with speed
  if (player.state === 'run') {
    const runSpeed = Math.abs(player.vx);
    const speedRatio = Math.min(runSpeed / effWalkSpeed, 1);
    const interval = 0.22 - speedRatio * 0.12;
    let fAcc = footstepAccs.get(player.id) || 0;
    fAcc += dt;
    if (fAcc >= interval) {
      fAcc -= interval;
      const playerBottom = player.y + player.height;
      const name = playerBottom > 600 ? 'footstep_grass' : 'footstep_wood';
      audio.setVolume(name, 0.08 + speedRatio * 0.2);
      playSound(name);
    }
    footstepAccs.set(player.id, fAcc);
  } else {
    footstepAccs.set(player.id, 0);
  }

  // Expressions: dizzy (invincible) and scared (fast fall)
  if (player.invincibleTimer > 0) {
    player.expression = 'dizzy';
  } else if (player.vy > 400) {
    player.expression = 'scared';
  }

  // sideSquash decay moved to GameLoop.fixedUpdate (before collidePlatforms)
  // so end-of-tick state is the physics-authored value when wall-pressing,
  // not the post-decay value (which the half-rate cosmetic step left
  // alternating with the freshly-set 0.75 — visible as a 30Hz flicker).

  // Fat wobble
  if (player.fatTimer > 0) {
    player.squashScale = f(player.squashScale * f(1 + f(fastSin(f(timeElapsed * 6)) * 0.05)));
  }
}
