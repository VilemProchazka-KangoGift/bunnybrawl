import type { Arena, MatchState, Player, PlayerSlot, Ripple, SurfaceTag } from '../../types';
import {
  DUST_LAND_VY_THRESHOLD,
  HARD_LAND_VY_THRESHOLD,
  SURFACE_DECAL_MAX,
  SURFACE_RIPPLE_MAX,
  SURFACE_CRACK_LIFE,
  SURFACE_GLASS_CRACK_LIFE,
  SURFACE_RIPPLE_LIFE,
  SURFACE_SCUFF_LIFE,
} from '../../constants';
import { hexToRGB } from '../../fastMath';
import { platformUnderFoot, surfaceOf, swapRemove } from '../../themes/utils';
import { CAP_DEPTH, SKEW_RATIO } from '../../themes/drawPrimitives/platforms';
import { SURFACE_PALETTE } from './surfacePalette';

/** Iso-skew shift at the cap centerline. The cap is a parallelogram whose
 *  back-edge runs `sp = CAP_DEPTH * SKEW_RATIO` px to the right of the
 *  front-edge; the centerline (where decals are drawn) is shifted by half
 *  that. Used to align decal clip rects with the visible cap on iso platforms. */
const ISO_CAP_SHIFT = (CAP_DEPTH * SKEW_RATIO) / 2;

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

export function decalLife(kind: 'crack' | 'scuff', surface: SurfaceTag): number {
  if (kind === 'crack') {
    if (surface === 'glass') return SURFACE_GLASS_CRACK_LIFE;
    if (surface === 'ice') return SURFACE_CRACK_LIFE;
    return 0;
  }
  return SURFACE_SCUFF_LIFE;
}

export function pushSurfaceDecal(
  state: MatchState,
  decal: { kind: 'crack' | 'scuff'; x: number; y: number; life: number; seed: number; color: string; surface: SurfaceTag; clipMinX?: number; clipMaxX?: number },
): void {
  if (decal.life <= 0) return;
  // FIFO eviction so the user always sees the most recent impacts.
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
  random: () => number;
  emitParticle: (x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) => void;
}

/**
 * Top-hemisphere debris on hard landing. Particles ride the existing
 * pool's gravity and arc outward; flecks past the platform edge fall
 * naturally into empty space.
 */
function emitScuffDebris(
  cx: number, fy: number, surface: SurfaceTag, cb: SurfaceImpactCallbacks,
): void {
  const palette = SURFACE_PALETTE[surface].debris;
  const count = surface === 'metal' ? 10 : 8;
  for (let i = 0; i < count; i++) {
    const t = i / count + cb.random() * 0.06;
    const angle = -Math.PI + t * Math.PI;
    const speed = 80 + cb.random() * 140;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 40 - cb.random() * 60;
    const life = 0.45 + cb.random() * 0.35;
    // Sparks: small + bright. Chunks: bigger.
    const size = surface === 'metal'
      ? 0.8 + cb.random() * 0.6
      : 1.4 + cb.random() * 1.0;
    cb.emitParticle(cx, fy - 1, vx, vy, life, size, palette[i % 2]);
  }
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
      // Iso platforms (leftCollisionInset set) have a parallelogram cap
      // shifted right by sp at the back. Shift clip extent to the cap
      // centerline so decals don't overflow the visible top.
      const shift = plat?.leftCollisionInset !== undefined ? ISO_CAP_SHIFT : 0;
      const clip = plat
        ? { clipMinX: plat.x + shift, clipMaxX: plat.x + plat.width + shift }
        : {};

      pushSurfaceDecal(state, {
        ...clip, kind: 'scuff', x: cx, y: fy, surface,
        life: decalLife('scuff', surface),
        seed: cb.random(),
        color: scuffColorFor(player.character.darkColor),
      });

      if (!slow) {
        emitScuffDebris(cx, fy, surface, cb);
      }

      if (!slow && (surface === 'ice' || surface === 'glass')) {
        pushSurfaceDecal(state, {
          ...clip, kind: 'crack', x: cx, y: fy, surface,
          life: decalLife('crack', surface),
          seed: cb.random(),
          color: surface === 'ice' ? '#FFFFFF' : '#E0F8FF',
        });
      }
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

/** Desaturate the character's dark tone toward dark gray for ground readability. */
function scuffColorFor(darkColor: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(darkColor)) return '#3A2820';
  const { r, g, b } = hexToRGB(darkColor);
  const blend = 0.5;
  const gray = 64;
  const rr = Math.round(r * (1 - blend) + gray * blend);
  const gg = Math.round(g * (1 - blend) + gray * blend);
  const bb = Math.round(b * (1 - blend) + gray * blend);
  return `rgb(${rr},${gg},${bb})`;
}
