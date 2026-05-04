import type { Arena, Player, PlayerSlot, SurfaceTag } from '../../types';
import {
  AFTERIMAGE_INTERVAL, AFTERIMAGE_SPEED_THRESHOLD, AFTERIMAGE_MAX,
} from '../../constants';
import { tickIdleStateMachine } from '../../rendering/idleActions';
import { audio } from '../../audio';
import { surfaceAt, swapRemove } from '../../themes/utils';
import { getSlowDevice } from '../../perfFlags';

const FIRE_COLORS = ['#FF4400', '#FF8800', '#FFCC00', '#FFAA00'];

/**
 * Surface → footstep sound name. Reuses existing grass/wood SFX where
 * timbres overlap; ice is silent (sliding). Routes:
 *   grass/snow/sand → footstep_grass (soft, muffled)
 *   wood/stone/metal/glass → footstep_wood (sharp)
 *   ice → null (no sound)
 */
function footstepSoundFor(surface: SurfaceTag): string | null {
  switch (surface) {
    case 'ice':    return null;
    case 'snow':
    case 'sand':
    case 'grass':  return 'footstep_grass';
    default:       return 'footstep_wood';
  }
}

/** Surface → footstep dust color (env-sparks tints + var-dust palette). */
function footstepDustColorFor(surface: SurfaceTag): string {
  switch (surface) {
    case 'grass':  return '#A8C878';
    case 'stone':  return '#C0B898';
    case 'wood':   return '#C8AA80';
    case 'snow':   return '#F8FAFF';
    case 'sand':   return '#E8D8A0';
    case 'ice':    return '#D8F0FF';
    case 'metal':  return '#FFE8B0';  // bright spark-like
    case 'glass':  return '#FFFFFF';
    default:       return '#C8AA80';
  }
}

/**
 * Update per-player cosmetic state: animation, fire particles, idle anim,
 * afterimages, footstep sounds, expressions, squash decay, fat wobble.
 * Called for each active player NOT in hitstop.
 */
export function updatePlayerCosmetics(
  player: Player, dt: number,
  effWalkSpeed: number,
  afterimageAccs: Map<PlayerSlot, number>,
  footstepAccs: Map<PlayerSlot, number>,
  emitParticle: (x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) => void,
  playSound: (name: string) => void,
  arena?: Arena,
): void {
  // animFrame advance moved to Simulator.fixedUpdate — animFrame is in the
  // snapshot, so advancing it on guest's local clock (which drifts vs host)
  // overrode the snapshot value at non-deterministic times, causing visible
  // shake in the run cycle. animTimer stays local (cosmetic-only).
  if (player.state !== 'run') {
    player.animTimer = 0;
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

  tickIdleStateMachine(player, dt);

  // Afterimages — spawn at speed threshold or during invincibility. Skipped on
  // slow-device; decay loop below still drains pre-existing entries.
  const speed = Math.max(Math.abs(player.vx), Math.abs(player.vy));
  const spawnAfterimage = !getSlowDevice()
    && (speed > AFTERIMAGE_SPEED_THRESHOLD || player.invincibleTimer > 0);
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

  // Footstep sounds + surface-aware dust (env-sparks / var-dust).
  // Tempo, volume, AND puff size scale with speed (var-dust). Surface
  // beneath the player picks both sound timbre and particle palette.
  if (player.state === 'run') {
    const runSpeed = Math.abs(player.vx);
    const speedRatio = Math.min(runSpeed / effWalkSpeed, 1);
    const interval = 0.22 - speedRatio * 0.12;
    let fAcc = footstepAccs.get(player.id) || 0;
    fAcc += dt;
    if (fAcc >= interval) {
      fAcc -= interval;

      const cx = player.x + player.width / 2;
      const fy = player.y + player.height;
      // Fall back to legacy ground-y heuristic when arena is unavailable
      // (preserves existing test fixtures that don't pass arena through).
      const surface: SurfaceTag = arena
        ? surfaceAt(arena, cx, fy)
        : (fy > 600 ? 'grass' : 'wood');

      const name = footstepSoundFor(surface);
      if (name !== null) {
        audio.setVolume(name, 0.08 + speedRatio * 0.2);
        playSound(name);
      }

      // Var-dust puff: small at low speed, larger trailing at full speed.
      // Slow-device skips dust spawn (audio still plays).
      if (!getSlowDevice()) {
        const color = footstepDustColorFor(surface);
        const behind = player.facing === 'right' ? -1 : 1;
        const sx = cx + behind * (player.width * 0.3);
        const sy = fy - 1;
        const baseSize = 1 + speedRatio * 1.4;
        const baseLife = 0.16 + speedRatio * 0.12;

        if (surface === 'metal' || surface === 'glass') {
          // Bright spark-style emission: smaller, faster, fewer.
          emitParticle(sx, sy, behind * (40 + speedRatio * 30), -30 - Math.random() * 30,
            baseLife * 0.7, 0.8 + Math.random() * 0.6, color);
        } else if (surface === 'ice') {
          // Tiny ice glints, subtle.
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
    footstepAccs.set(player.id, fAcc);
  } else {
    footstepAccs.set(player.id, 0);
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
