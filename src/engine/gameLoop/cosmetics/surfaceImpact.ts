import type { Arena, MatchState, Player, PlayerSlot, Ripple, SurfaceTag } from '../../types';
import {
  DUST_LAND_VY_THRESHOLD,
  HARD_LAND_VY_THRESHOLD,
  SURFACE_DECAL_MAX,
  SURFACE_RIPPLE_MAX,
  SURFACE_CRACK_LIFE,
  SURFACE_GLASS_CRACK_LIFE,
  SURFACE_RIPPLE_LIFE,
  SURFACE_MINI_CRACK_LIFE,
} from '../../constants';
import { platformUnderFoot, surfaceOf, swapRemove } from '../../themes/utils';
import type { Platform } from '../../types';
import { CAP_DEPTH, SKEW_RATIO } from '../../themes/drawPrimitives/platforms';
import { ICE_CUBE_DEPTH_RATIO } from '../../themes/drawPrimitives/winter';
import { SURFACE_PALETTE } from './surfacePalette';

/** Inscribed-rectangle horizontal shift for iso platforms. The visible cap
 *  is a parallelogram whose back-edge runs `sp = CAP_DEPTH * SKEW_RATIO` px
 *  right of the front-edge. The widest rectangle that fits inside the cap
 *  at every y is `[plat.x + sp, plat.x + plat.width]`. */
const ISO_INSCRIBED_LEFT_SHIFT = CAP_DEPTH * SKEW_RATIO;

/** Left inset (px) for the platform's clip rect so decals stay inside the
 *  visible top face. iceCubes use a deeper 3D draw than the standard iso cap. */
function clipLeftInset(plat: Platform): number {
  if (plat.style === 'iceCube') return plat.width * ICE_CUBE_DEPTH_RATIO;
  if (plat.leftCollisionInset !== undefined) return ISO_INSCRIBED_LEFT_SHIFT;
  return 0;
}

export interface PrevSurfaceImpactState {
  state: Player['state'];
  vy: number;
  inLava: boolean;
  fastFalling: boolean;
}

export function snapshotSurfaceImpactState(player: Player, arena: Arena): PrevSurfaceImpactState {
  return {
    state: player.state,
    vy: player.vy,
    inLava: isInLavaZone(player, arena),
    fastFalling: player.fastFalling,
  };
}

export function isInLavaZone(player: Player, arena: Arena): boolean {
  if (!arena.hazardZones) return false;
  const cx = player.x + player.width / 2;
  const by = player.y + player.height;
  for (const hz of arena.hazardZones) {
    if (hz.type !== 'lava') continue;
    if (cx >= hz.x && cx <= hz.x + hz.width && by >= hz.y && by <= hz.y + hz.height) return true;
  }
  return false;
}

export function pushSurfaceDecal(
  state: MatchState,
  decal: { kind: 'full' | 'mini'; x: number; y: number; life: number; seed: number; color: string; surface: SurfaceTag; clipMinX?: number; clipMaxX?: number },
): void {
  if (decal.life <= 0) return;
  if (state.surfaceDecals.length >= SURFACE_DECAL_MAX) {
    state.surfaceDecals.shift();
  }
  state.surfaceDecals.push({ ...decal, age: 0 });
}

export function pushRipple(state: MatchState, x: number, y: number, surface: Ripple['surface']): void {
  if (state.ripples.length >= SURFACE_RIPPLE_MAX) {
    state.ripples.shift();
  }
  state.ripples.push({ x, y, surface, age: 0 });
}

export function updateSurfaceLifetimes(state: MatchState, dt: number): void {
  for (let i = state.surfaceDecals.length - 1; i >= 0; i--) {
    state.surfaceDecals[i].age += dt;
    if (state.surfaceDecals[i].age >= state.surfaceDecals[i].life) {
      swapRemove(state.surfaceDecals, i);
    }
  }
  for (let i = state.ripples.length - 1; i >= 0; i--) {
    state.ripples[i].age += dt;
    if (state.ripples[i].age >= SURFACE_RIPPLE_LIFE) {
      swapRemove(state.ripples, i);
    }
  }
}

export interface SurfaceImpactCallbacks {
  isSlowDevice: () => boolean;
}

export function detectSurfaceImpact(
  player: Player,
  prev: PrevSurfaceImpactState,
  state: MatchState,
  arena: Arena,
  cb: SurfaceImpactCallbacks,
): void {
  const wasAirborne = prev.state === 'airborne';
  const isGrounded = player.state === 'idle' || player.state === 'run';
  const slow = cb.isSlowDevice();
  const absVy = Math.abs(prev.vy);

  if (wasAirborne && isGrounded && absVy >= DUST_LAND_VY_THRESHOLD) {
    const cx = player.x + player.width / 2;
    const fy = player.y + player.height;
    // Use the player's full foot extent — handles half-off-edge landings
    // where the center is past plat.x + plat.width but the bbox overlaps.
    const plat = platformUnderFoot(arena, player.x, player.x + player.width, fy);
    const surface = surfaceOf(plat, arena);
    const hardLanding = absVy >= HARD_LAND_VY_THRESHOLD || prev.fastFalling;

    if (hardLanding) {
      const clip = plat
        ? { clipMinX: plat.x + clipLeftInset(plat), clipMaxX: plat.x + plat.width }
        : {};
      const useFullCrack = !slow && (surface === 'ice' || surface === 'glass');
      const kind = useFullCrack ? 'full' : 'mini';
      const life = useFullCrack
        ? (surface === 'glass' ? SURFACE_GLASS_CRACK_LIFE : SURFACE_CRACK_LIFE)
        : SURFACE_MINI_CRACK_LIFE;
      pushSurfaceDecal(state, {
        ...clip, kind, x: cx, y: fy, surface, life,
        seed: Math.random(),
        color: SURFACE_PALETTE[surface].dust,
      });
    }
  }

  const inLava = isInLavaZone(player, arena);
  if (!prev.inLava && inLava && !slow) {
    pushRipple(state, player.x + player.width / 2, player.y + player.height, 'lava');
  }

  prev.state = player.state;
  prev.vy = player.vy;
  prev.inLava = inLava;
  prev.fastFalling = player.fastFalling;
}

export function resetSurfaceImpactBaselines(
  state: MatchState,
  arena: Arena,
  prevMap: Map<PlayerSlot, PrevSurfaceImpactState>,
): void {
  prevMap.clear();
  for (const p of state.players) {
    prevMap.set(p.id, snapshotSurfaceImpactState(p, arena));
  }
}
