import type { Arena, MatchState, Player, PlayerSlot, SurfaceTag } from '../../types';
import {
  DUST_LAND_VY_THRESHOLD,
  HARD_LAND_VY_THRESHOLD,
  SURFACE_DECAL_MAX,
  SURFACE_CRACK_LIFE,
  SURFACE_GLASS_CRACK_LIFE,
  SURFACE_SCUFF_LIFE,
  SURFACE_RIPPLE_LIFE,
  SURFACE_RIPPLE_MAX_RADIUS,
} from '../../constants';
import { platformAt, surfaceOf } from '../../themes/utils';

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
  if (state.surfaceDecals.length >= SURFACE_DECAL_MAX) {
    state.surfaceDecals.shift();
  }
  state.surfaceDecals.push({ ...decal, age: 0 });
}

export function pushRipple(
  state: MatchState,
  x: number, y: number, surface: 'water' | 'lava',
): void {
  state.ripples.push({
    x, y, surface,
    age: 0,
    life: SURFACE_RIPPLE_LIFE,
    maxRadius: SURFACE_RIPPLE_MAX_RADIUS,
  });
}

export function updateSurfaceLifetimes(state: MatchState, dt: number): void {
  for (let i = state.surfaceDecals.length - 1; i >= 0; i--) {
    state.surfaceDecals[i].age += dt;
    if (state.surfaceDecals[i].age >= state.surfaceDecals[i].life) {
      state.surfaceDecals.splice(i, 1);
    }
  }
  for (let i = state.ripples.length - 1; i >= 0; i--) {
    state.ripples[i].age += dt;
    if (state.ripples[i].age >= state.ripples[i].life) {
      state.ripples.splice(i, 1);
    }
  }
}

export interface SurfaceImpactCallbacks {
  isSlowDevice: () => boolean;
  random: () => number;
  emitParticle: (x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) => void;
}

/**
 * Surface debris palette for the airborne flecks emitted on hard landings.
 * Two colors per surface — alternated across emitted particles for variety.
 */
const DEBRIS_COLORS: Record<SurfaceTag, [string, string]> = {
  grass: ['#4A7A30', '#8AB860'],
  stone: ['#7A7066', '#C0B898'],
  wood:  ['#7A4F28', '#C8A278'],
  snow:  ['#E8F0FF', '#FFFFFF'],
  sand:  ['#A88858', '#E8D8A0'],
  metal: ['#FFE8B0', '#FFFFFF'],
  ice:   ['#A8C8E0', '#E8F8FF'],
  glass: ['#C0D8E0', '#FFFFFF'],
};

/**
 * Emit airborne scuff debris flecks on a hard landing. Particles arc outward
 * via existing particle gravity. Top hemisphere only — debris jumps UP from
 * the impact, never tunnels into the platform.
 */
function emitScuffDebris(
  cx: number, fy: number, surface: SurfaceTag, cb: SurfaceImpactCallbacks,
): void {
  const palette = DEBRIS_COLORS[surface] ?? DEBRIS_COLORS.stone;
  const count = surface === 'metal' ? 10 : 8;
  for (let i = 0; i < count; i++) {
    // Angle in top hemisphere: -π (left) to 0 (right), biased toward upward.
    const t = i / count + cb.random() * 0.06;
    const angle = -Math.PI + t * Math.PI;
    const speed = 80 + cb.random() * 140;
    const vx = Math.cos(angle) * speed;
    // Always upward kick on top of the radial component
    const vy = Math.sin(angle) * speed - 40 - cb.random() * 60;
    const life = 0.45 + cb.random() * 0.35;
    const size = surface === 'metal'
      ? 0.8 + cb.random() * 0.6   // sparks: small + bright
      : 1.4 + cb.random() * 1.0;  // chunks
    const color = palette[i % 2];
    cb.emitParticle(cx, fy - 1, vx, vy, life, size, color);
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

  if (wasAirborne && isGrounded && Math.abs(prev.vy) >= DUST_LAND_VY_THRESHOLD) {
    const cx = player.x + player.width / 2;
    const fy = player.y + player.height;
    const plat = platformAt(arena, cx, fy);
    const surface = surfaceOf(plat, arena);
    const hardLanding = Math.abs(prev.vy) >= HARD_LAND_VY_THRESHOLD || prev.fastFalling;

    if (hardLanding) {
      pushSurfaceDecal(state, {
        kind: 'scuff', x: cx, y: fy,
        life: decalLife('scuff', surface),
        seed: cb.random(),
        color: scuffColorFor(player.character.darkColor),
        surface,
        clipMinX: plat?.x,
        clipMaxX: plat ? plat.x + plat.width : undefined,
      });

      // Airborne debris flecks — always emitted regardless of edge proximity.
      // Particles outside the platform fall into empty space naturally.
      if (!slow) {
        emitScuffDebris(cx, fy, surface, cb);
      }

      if (!slow && (surface === 'ice' || surface === 'glass')) {
        pushSurfaceDecal(state, {
          kind: 'crack', x: cx, y: fy,
          life: decalLife('crack', surface),
          seed: cb.random(),
          color: surface === 'ice' ? '#FFFFFF' : '#E0F8FF',
          surface,
          clipMinX: plat?.x,
          clipMaxX: plat ? plat.x + plat.width : undefined,
        });
      }
    }

  }

  const inLava = isInLavaZone(player, arena);
  if (!prev.inLava && inLava && !slow) {
    const cx = player.x + player.width / 2;
    const fy = player.y + player.height;
    pushRipple(state, cx, fy, 'lava');
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

function scuffColorFor(darkColor: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(darkColor);
  if (!m) return '#3A2820';
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const gray = 64;
  const blend = 0.5;
  const rr = Math.round(r * (1 - blend) + gray * blend);
  const gg = Math.round(g * (1 - blend) + gray * blend);
  const bb = Math.round(b * (1 - blend) + gray * blend);
  return `rgb(${rr},${gg},${bb})`;
}
