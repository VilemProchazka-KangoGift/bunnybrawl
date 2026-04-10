import { describe, it, expect } from 'vitest';
import {
  canJumpTo,
  canDropTo,
  canWalkTo,
  canGeyserTo,
  canZeroGTo,
  computeEdgeDanger,
  type ReachResult,
} from '../reachability';
import type { Platform, EffectZone } from '../../types';
import {
  JUMP_IMPULSE,
  GRAVITY,
  MAX_WALK_SPEED,
  PLAYER_WIDTH,
  CANVAS_WIDTH,
} from '../../constants';

// Derived constant matching the source: v^2 / (2g) ~= 174.22
const MAX_JUMP_HEIGHT = (JUMP_IMPULSE * JUMP_IMPULSE) / (2 * GRAVITY);

/** Helper to create a platform object. */
function plat(x: number, y: number, width: number, height = 20): Platform {
  return { x, y, width, height };
}

/** Helper to create an EffectZone. */
function zone(
  type: EffectZone['type'],
  x: number,
  y: number,
  width: number,
  height: number,
): EffectZone {
  return { x, y, width, height, type };
}

// ---------------------------------------------------------------------------
// canJumpTo
// ---------------------------------------------------------------------------
describe('canJumpTo', () => {
  it('reaches a platform slightly above within jump height', () => {
    const from = plat(100, 500, 200);
    const to = plat(100, 380, 200); // 120px rise, well within ~174
    const result = canJumpTo(from, to);
    expect(result.reachable).toBe(true);
  });

  it('reaches platform at same height (horizontal jump)', () => {
    const from = plat(100, 400, 100);
    const to = plat(300, 400, 100);
    // Air time at 0 rise: tDescend = (-JUMP_IMPULSE + sqrt(JUMP^2)) / GRAVITY
    //   = (560 + 560) / 900 ~= 1.244s  -> maxHDist ~= 348px
    // Gap between platform edges: 300 - 200 = 100px (center-to-center accounting for PLAYER_WIDTH)
    const result = canJumpTo(from, to);
    expect(result.reachable).toBe(true);
  });

  it('returns unreachable when target is too high', () => {
    const from = plat(100, 500, 200);
    const to = plat(100, 300, 200); // 200px rise, exceeds ~174
    expect(canJumpTo(from, to).reachable).toBe(false);
  });

  it('returns unreachable when target is significantly below (use drop instead)', () => {
    const from = plat(100, 300, 200);
    const to = plat(100, 500, 200); // 200px below
    expect(canJumpTo(from, to).reachable).toBe(false);
  });

  it('allows small downward offset (riseNeeded >= -10)', () => {
    const from = plat(100, 400, 200);
    const to = plat(100, 408, 200); // 8px below -> riseNeeded = -8, within tolerance
    expect(canJumpTo(from, to).reachable).toBe(true);
  });

  it('returns correct approachX when jumping right', () => {
    const from = plat(100, 400, 100);
    const to = plat(350, 350, 100);
    const result = canJumpTo(from, to);
    expect(result.reachable).toBe(true);
    // Should approach from the right edge of 'from'
    expect(result.approachX).toBe(from.x + from.width - PLAYER_WIDTH);
  });

  it('returns correct approachX when jumping left', () => {
    const from = plat(500, 400, 100);
    const to = plat(200, 350, 100);
    const result = canJumpTo(from, to);
    expect(result.reachable).toBe(true);
    // Should approach from the left edge of 'from'
    expect(result.approachX).toBe(from.x);
  });

  it('handles screen-wrap to reach platform on the other side', () => {
    // 'from' near the right edge, 'to' near the left edge.
    // Direct distance is huge, but wrap distance is small.
    const from = plat(CANVAS_WIDTH - 60, 400, 50);
    const to = plat(10, 400, 50);
    // Direct gap: 10 - (1280-60+50) = very far. Wrap gap: wrapping right -> 10 + 1280 - 1270 = 20
    const result = canJumpTo(from, to);
    expect(result.reachable).toBe(true);
  });

  it('fails when target is too far horizontally and no wrap helps', () => {
    const from = plat(100, 400, 60);
    const to = plat(800, 300, 60);
    // Rise ~100px. discriminant = 560^2 - 2*900*100 = 313600 - 180000 = 133600
    // tDescend = (560 + sqrt(133600)) / 900 ~= (560 + 365.5) / 900 ~= 1.028s
    // maxHDist = 280 * 1.028 ~= 288px
    // Gap: 800 - 160 = 640px (from right edge to left edge, center-adjusted)
    // Way too far
    expect(canJumpTo(from, to).reachable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canDropTo
// ---------------------------------------------------------------------------
describe('canDropTo', () => {
  it('reaches a platform directly below', () => {
    const from = plat(200, 300, 200);
    const to = plat(200, 500, 200); // 200px drop
    const result = canDropTo(from, to);
    expect(result.reachable).toBe(true);
  });

  it('returns unreachable when target is above', () => {
    const from = plat(200, 500, 200);
    const to = plat(200, 300, 200);
    expect(canDropTo(from, to).reachable).toBe(false);
  });

  it('returns unreachable when target is nearly same height (< 10px drop)', () => {
    const from = plat(200, 400, 200);
    const to = plat(200, 405, 200); // only 5px below
    expect(canDropTo(from, to).reachable).toBe(false);
  });

  it('returns correct approachX when target is to the right', () => {
    const from = plat(100, 300, 100);
    const to = plat(250, 450, 100);
    const result = canDropTo(from, to);
    expect(result.reachable).toBe(true);
    // Target center is right of from center -> approach right edge
    expect(result.approachX).toBe(from.x + from.width - PLAYER_WIDTH);
  });

  it('returns correct approachX when target is to the left', () => {
    const from = plat(400, 300, 100);
    const to = plat(200, 450, 100);
    const result = canDropTo(from, to);
    expect(result.reachable).toBe(true);
    // Target center is left of from center -> approach left edge
    expect(result.approachX).toBe(from.x);
  });

  it('fails when target is far away horizontally with short drop', () => {
    const from = plat(100, 400, 60);
    const to = plat(800, 420, 60);
    // Drop = 20px. fallTime = sqrt(2*20/900) ~= 0.211s
    // maxHDrift = 280 * 0.211 ~= 59px. Gap = 800-160 = 640px. Way too far.
    expect(canDropTo(from, to).reachable).toBe(false);
  });

  it('handles screen-wrap for drops', () => {
    const from = plat(CANVAS_WIDTH - 50, 300, 40);
    const to = plat(10, 500, 40);
    // Direct gap is huge, but wrapping should close it
    const result = canDropTo(from, to);
    expect(result.reachable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canWalkTo
// ---------------------------------------------------------------------------
describe('canWalkTo', () => {
  it('returns true for adjacent platforms at same height', () => {
    const a = plat(100, 400, 100);
    const b = plat(200, 400, 100); // touching edges
    expect(canWalkTo(a, b)).toBe(true);
  });

  it('returns true when platforms overlap horizontally', () => {
    const a = plat(100, 400, 150);
    const b = plat(200, 400, 150);
    expect(canWalkTo(a, b)).toBe(true);
  });

  it('returns true with small gap (within PLAYER_WIDTH)', () => {
    const a = plat(100, 400, 100);
    const b = plat(220, 400, 100); // 20px gap, < PLAYER_WIDTH=32
    expect(canWalkTo(a, b)).toBe(true);
  });

  it('returns false when height difference exceeds tolerance (8px)', () => {
    const a = plat(100, 400, 100);
    const b = plat(200, 420, 100); // 20px height diff
    expect(canWalkTo(a, b)).toBe(false);
  });

  it('returns false when gap exceeds PLAYER_WIDTH', () => {
    const a = plat(100, 400, 100);
    const b = plat(250, 400, 100); // 50px gap > 32
    expect(canWalkTo(a, b)).toBe(false);
  });

  it('returns true at exact tolerance (8px height, 32px gap)', () => {
    const a = plat(100, 400, 100);
    const b = plat(232, 408, 100); // 32px gap exactly = PLAYER_WIDTH, 8px height
    expect(canWalkTo(a, b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canGeyserTo
// ---------------------------------------------------------------------------
describe('canGeyserTo', () => {
  it('reaches platform above when geyser overlaps both platforms', () => {
    const from = plat(300, 600, 100);
    const geyser = zone('geyser', 320, 300, 60, 320);
    const to = plat(310, 350, 80);
    const result = canGeyserTo(from, geyser, to);
    expect(result.reachable).toBe(true);
  });

  it('returns unreachable when target is below source', () => {
    const from = plat(300, 400, 100);
    const geyser = zone('geyser', 320, 300, 60, 200);
    const to = plat(300, 500, 100);
    expect(canGeyserTo(from, geyser, to).reachable).toBe(false);
  });

  it('returns unreachable when target is far above the geyser zone', () => {
    const from = plat(300, 600, 100);
    const geyser = zone('geyser', 320, 400, 60, 200);
    // Target at y=100 is well above geyser.y(400) - 50 = 350
    const to = plat(300, 100, 100);
    expect(canGeyserTo(from, geyser, to).reachable).toBe(false);
  });

  it('returns unreachable when source platform is too far from geyser', () => {
    const from = plat(0, 600, 50);
    const geyser = zone('geyser', 600, 300, 60, 300);
    const to = plat(600, 350, 60);
    // from is 550px away from geyser, far exceeds PLAYER_WIDTH*2
    expect(canGeyserTo(from, geyser, to).reachable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canZeroGTo
// ---------------------------------------------------------------------------
describe('canZeroGTo', () => {
  it('reaches platform within zero-G zone', () => {
    const from = plat(200, 500, 100);
    const zg = zone('zero_g', 150, 250, 300, 300);
    const to = plat(300, 350, 100);
    const result = canZeroGTo(from, zg, to);
    expect(result.reachable).toBe(true);
  });

  it('returns unreachable when source is too far from zone', () => {
    const from = plat(0, 400, 50);
    const zg = zone('zero_g', 500, 200, 200, 300);
    const to = plat(550, 250, 100);
    // from is far left, zone starts at 500 -> gap = 500-50 = 450 >> 100
    expect(canZeroGTo(from, zg, to).reachable).toBe(false);
  });

  it('returns unreachable when target is well outside zone vertically', () => {
    const from = plat(200, 500, 100);
    const zg = zone('zero_g', 150, 350, 300, 200); // zone: y=350..550
    const to = plat(200, 100, 100); // target at y=100, zone top=350-100=250 -> outside
    expect(canZeroGTo(from, zg, to).reachable).toBe(false);
  });

  it('returns unreachable when rise exceeds 3x max jump height', () => {
    const from = plat(200, 700, 100);
    // zone is tall enough, but rise is enormous
    const zg = zone('zero_g', 150, 0, 300, 800);
    const to = plat(200, 50, 100); // rise = 650px, 3*174 ~= 522
    expect(canZeroGTo(from, zg, to).reachable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeEdgeDanger
// ---------------------------------------------------------------------------
describe('computeEdgeDanger', () => {
  it('returns 0 when there are no hazard zones', () => {
    const from = plat(100, 400, 100);
    const to = plat(300, 400, 100);
    expect(computeEdgeDanger(from, to, 'jump', [])).toBe(0);
  });

  it('returns high danger when path passes through a hazard', () => {
    const from = plat(100, 400, 100);
    const to = plat(300, 400, 100);
    // Hazard centered between the two platforms
    const hazard = { x: 180, y: 370, width: 80, height: 40 };
    const danger = computeEdgeDanger(from, to, 'walk', [hazard]);
    expect(danger).toBeGreaterThan(0.5);
  });

  it('returns 0 when hazard is far from path', () => {
    const from = plat(100, 400, 100);
    const to = plat(300, 400, 100);
    // Hazard far away (y=100, far above the y=400 path)
    const hazard = { x: 200, y: 100, width: 40, height: 40 };
    const danger = computeEdgeDanger(from, to, 'walk', [hazard]);
    expect(danger).toBe(0);
  });

  it('returns max danger (1.0) when sample point is inside hazard', () => {
    const from = plat(200, 400, 100);
    const to = plat(200, 400, 100); // same platform (walking in place)
    // Huge hazard covering the destination
    const hazard = { x: 150, y: 350, width: 200, height: 100 };
    const danger = computeEdgeDanger(from, to, 'walk', [hazard]);
    expect(danger).toBe(1);
  });

  it('accounts for jump arc elevation when type is jump', () => {
    const from = plat(100, 400, 100);
    const to = plat(300, 400, 100);
    // Midpoint sample for jumps has y offset of -60 -> y = 340
    // Place hazard at y ~340 between the two platforms
    const hazard = { x: 180, y: 320, width: 60, height: 40 };
    const danger = computeEdgeDanger(from, to, 'jump', [hazard]);
    // Should detect the hazard in the jump arc path
    expect(danger).toBeGreaterThan(0);
  });
});
