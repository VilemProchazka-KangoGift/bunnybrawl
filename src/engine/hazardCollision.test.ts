import { describe, it, expect } from 'vitest';
import {
  checkSpringCollision,
  checkThornCollision,
  checkHazardZoneCollision,
  checkGhostCollision,
  checkLavaRockCollision,
} from './hazardCollision';
import type { SpringMushroom, Thorn, GhostEntity, LavaRock, HazardZone } from './types';
import { PLAYER_WIDTH, PLAYER_HEIGHT, SPRING_SIZE, THORN_SLOW_DURATION } from './constants';
import { makePlayer } from './__tests__/testHelpers';

function makeSpring(overrides: Partial<SpringMushroom> = {}): SpringMushroom {
  return {
    x: 110,
    y: 440,
    platformIndex: 0,
    bounceTimer: 0,
    life: 10,
    growTimer: 0,
    ...overrides,
  };
}

function makeThorn(overrides: Partial<Thorn> = {}): Thorn {
  return {
    x: 95,
    y: 410,
    width: 16,
    height: 20,
    platformIndex: 0,
    life: 10,
    growTimer: 0,
    hit: false,
    ...overrides,
  };
}

function makeGhost(overrides: Partial<GhostEntity> = {}): GhostEntity {
  return {
    x: 120,
    y: 420,
    vx: 30,
    size: 40,
    alpha: 0.8,
    wobblePhase: 0,
    ...overrides,
  };
}

function makeLavaRock(overrides: Partial<LavaRock> = {}): LavaRock {
  return {
    x: 120,
    y: 420,
    vy: 100,
    size: 12,
    rotation: 0,
    active: true,
    ...overrides,
  };
}

describe('Spring collision', () => {
  it('returns result with correct springIndex when overlapping', () => {
    // Player at (100, 400), 28x40. Spring at (110, 440) -> AABB = (100, 420, 20, 20)
    // Player AABB = (100, 400, 28, 40) -> bottom at 440
    // Spring AABB = (110-10, 440-20, 20, 20) = (100, 420, 20, 20)
    // overlap: 100 < 120 && 128 > 100 && 400 < 440 && 440 > 420 => yes
    const player = makePlayer({ vy: 10 }); // falling down
    const springs = [
      makeSpring({ x: 200, y: 200 }), // far away, no overlap
      makeSpring({ x: 110, y: 440 }),   // overlapping
    ];
    const result = checkSpringCollision(player, springs);
    expect(result).not.toBeNull();
    expect(result!.springIndex).toBe(1);
  });

  it('returns null when player is moving upward', () => {
    const player = makePlayer({ vy: -100 }); // moving up
    const springs = [makeSpring({ x: 110, y: 440 })];
    const result = checkSpringCollision(player, springs);
    expect(result).toBeNull();
  });

  it('respects bounceTimer cooldown', () => {
    const player = makePlayer({ vy: 10 });
    const springs = [makeSpring({ bounceTimer: 0.2 })]; // still cooling down
    const result = checkSpringCollision(player, springs);
    expect(result).toBeNull();
  });

  it('skips springs that are still growing', () => {
    const player = makePlayer({ vy: 10 });
    const springs = [makeSpring({ growTimer: 0.3 })];
    const result = checkSpringCollision(player, springs);
    expect(result).toBeNull();
  });

  it('returns null when no springs overlap', () => {
    const player = makePlayer({ vy: 10 });
    const springs = [makeSpring({ x: 500, y: 500 })]; // far away
    const result = checkSpringCollision(player, springs);
    expect(result).toBeNull();
  });
});

describe('Thorn collision', () => {
  it('returns result when player overlaps a thorn', () => {
    const player = makePlayer();
    const thorns = [makeThorn()];
    const result = checkThornCollision(player, thorns);
    expect(result).not.toBeNull();
    expect(result!.thornIndex).toBe(0);
  });

  it('skips already-hit thorns', () => {
    const player = makePlayer();
    const thorns = [makeThorn({ hit: true })];
    const result = checkThornCollision(player, thorns);
    expect(result).toBeNull();
  });

  it('skips thorns still growing', () => {
    const player = makePlayer();
    const thorns = [makeThorn({ growTimer: 0.5 })];
    const result = checkThornCollision(player, thorns);
    expect(result).toBeNull();
  });

  it('returns null when player is invincible', () => {
    const player = makePlayer({ invincibleTimer: 1.0 });
    const thorns = [makeThorn()];
    const result = checkThornCollision(player, thorns);
    expect(result).toBeNull();
  });

  it('returns null when player is already slowed', () => {
    const player = makePlayer({ slowTimer: 2.0 });
    const thorns = [makeThorn()];
    const result = checkThornCollision(player, thorns);
    expect(result).toBeNull();
  });
});

describe('Hazard zone collision', () => {
  it('returns result with correct knockback direction', () => {
    // Player center at (114, 420). Hazard zone center at (150, 420).
    // Player is LEFT of center => knockbackDir should be -1
    const player = makePlayer({ x: 100, y: 400 }); // center = 114
    const zones: HazardZone[] = [{
      x: 80, y: 390, width: 140, height: 60, type: 'lava',
    }];
    const result = checkHazardZoneCollision(player, zones);
    expect(result).not.toBeNull();
    expect(result!.zone.type).toBe('lava');
    expect(result!.knockbackDir).toBe(-1); // player center (114) < zone center (150)
  });

  it('returns null for invincible player', () => {
    const player = makePlayer({ invincibleTimer: 1.0 });
    const zones: HazardZone[] = [{
      x: 80, y: 390, width: 140, height: 60, type: 'lava',
    }];
    const result = checkHazardZoneCollision(player, zones);
    expect(result).toBeNull();
  });

  it('applies 12px inset on sides', () => {
    // Zone at x=100, width=30. With 12px inset, effective AABB is x=112, width=6.
    // Player at x=106, width=28 => right edge at 134. Effective zone right edge at 118.
    // Player left (106) < zone right (118) and player right (134) > zone left (112) => overlap.
    // But move player to x=119 => left edge at 119, zone right at 118 => no overlap.
    const player1 = makePlayer({ x: 106, y: 400 });
    const zones: HazardZone[] = [{
      x: 100, y: 390, width: 30, height: 60, type: 'lava',
    }];
    expect(checkHazardZoneCollision(player1, zones)).not.toBeNull();

    const player2 = makePlayer({ x: 119, y: 400 });
    expect(checkHazardZoneCollision(player2, zones)).toBeNull();
  });
});

describe('Ghost collision', () => {
  it('returns correct knockback direction when player is right of ghost', () => {
    // Ghost at (120, 420), size=40 => radius=20. Player center at (114, 420).
    // dx = 114-120 = -6, dy = 0. distance^2 = 36. hitRadius = 20 + 28*0.4 = 31.2. 31.2^2 = 973.44
    // 36 < 973.44 => collision. dx < 0 => knockbackDir = -1
    const player = makePlayer({ x: 100, y: 400 });
    const ghosts = [makeGhost({ x: 120, y: 420 })];
    const result = checkGhostCollision(player, ghosts);
    expect(result).not.toBeNull();
    expect(result!.knockbackDir).toBe(-1); // player center (114) < ghost (120)
  });

  it('returns knockback dir +1 when player is right of ghost', () => {
    const player = makePlayer({ x: 130, y: 400 }); // center = 144
    const ghosts = [makeGhost({ x: 120, y: 420 })];
    const result = checkGhostCollision(player, ghosts);
    expect(result).not.toBeNull();
    expect(result!.knockbackDir).toBe(1); // player center (144) > ghost (120)
  });

  it('returns null when player is invincible', () => {
    const player = makePlayer({ invincibleTimer: 1.0 });
    const ghosts = [makeGhost()];
    const result = checkGhostCollision(player, ghosts);
    expect(result).toBeNull();
  });

  it('returns null when player is already slowed', () => {
    const player = makePlayer({ slowTimer: 3.0 });
    const ghosts = [makeGhost()];
    const result = checkGhostCollision(player, ghosts);
    expect(result).toBeNull();
  });

  it('returns null when player is far from ghost', () => {
    const player = makePlayer({ x: 500, y: 100 }); // far away
    const ghosts = [makeGhost({ x: 120, y: 420 })];
    const result = checkGhostCollision(player, ghosts);
    expect(result).toBeNull();
  });
});

describe('Lava rock collision', () => {
  it('returns result with correct rockIndex for active rock', () => {
    const player = makePlayer({ x: 108, y: 400 }); // center = 122, 420
    const rocks = [makeLavaRock({ x: 120, y: 420 })];
    const result = checkLavaRockCollision(player, rocks);
    expect(result).not.toBeNull();
    expect(result!.rockIndex).toBe(0);
  });

  it('skips inactive rocks', () => {
    const player = makePlayer({ x: 108, y: 400 });
    const rocks = [makeLavaRock({ active: false })];
    const result = checkLavaRockCollision(player, rocks);
    expect(result).toBeNull();
  });

  it('returns null for invincible player', () => {
    const player = makePlayer({ invincibleTimer: 1.0, x: 108, y: 400 });
    const rocks = [makeLavaRock()];
    const result = checkLavaRockCollision(player, rocks);
    expect(result).toBeNull();
  });

  it('returns null when player is far from rock', () => {
    const player = makePlayer({ x: 500, y: 100 });
    const rocks = [makeLavaRock({ x: 120, y: 420 })];
    const result = checkLavaRockCollision(player, rocks);
    expect(result).toBeNull();
  });

  it('returns correct knockback direction', () => {
    // Player center at (122, 420), rock at (120, 420). dx = 2 > 0 => knockbackDir = 1
    const player = makePlayer({ x: 108, y: 400 });
    const rocks = [makeLavaRock({ x: 120, y: 420 })];
    const result = checkLavaRockCollision(player, rocks);
    expect(result).not.toBeNull();
    expect(result!.knockbackDir).toBe(1); // player center (122) > rock (120)
  });
});

// --- NEW TEST BLOCKS ---

describe('Ghost Knockback', () => {
  it('ghost hit returns a collision result (ghosts apply slowTimer, NOT burnTimer in gameLoop)', () => {
    // Ghost at (120, 420), size=40, radius=20. Player at (100, 400), center=(114, 416).
    // This verifies the collision is detected — gameLoop applies slowTimer only (no burnTimer).
    const player = makePlayer({ x: 100, y: 400 });
    const ghosts = [makeGhost({ x: 120, y: 420 })];
    const result = checkGhostCollision(player, ghosts);
    expect(result).not.toBeNull();
    // ghostIndex identifies which ghost was hit
    expect(result!.ghostIndex).toBe(0);
  });

  it('ghost hit applies knockback direction (vx changes via knockbackDir)', () => {
    // Player center at (114, 416), ghost at (120, 420). dx = 114-120 = -6 => knockbackDir = -1
    const player = makePlayer({ x: 100, y: 400 });
    const ghosts = [makeGhost({ x: 120, y: 420 })];
    const result = checkGhostCollision(player, ghosts);
    expect(result).not.toBeNull();
    expect(result!.knockbackDir).toBe(-1); // player left of ghost => push left

    // Player to the right of ghost
    const player2 = makePlayer({ x: 130, y: 400 }); // center = 144
    const result2 = checkGhostCollision(player2, ghosts);
    expect(result2).not.toBeNull();
    expect(result2!.knockbackDir).toBe(1); // player right of ghost => push right
  });

  it('ghost hit does NOT affect invincible players', () => {
    const player = makePlayer({ invincibleTimer: 1.5 });
    const ghosts = [makeGhost({ x: 120, y: 420 })];
    const result = checkGhostCollision(player, ghosts);
    expect(result).toBeNull();
  });
});

describe('Lava Burn', () => {
  it('lava hazard zone hit is detected (gameLoop sets BOTH burnTimer AND slowTimer)', () => {
    // Zone covers the player. In gameLoop, lava zones set both burnTimer and slowTimer to THORN_SLOW_DURATION.
    const player = makePlayer({ x: 100, y: 400 });
    const zones: HazardZone[] = [{
      x: 80, y: 390, width: 140, height: 60, type: 'lava',
    }];
    const result = checkHazardZoneCollision(player, zones);
    expect(result).not.toBeNull();
    expect(result!.zone.type).toBe('lava');
  });

  it('lava hit returns knockback direction for gameLoop to apply vx change', () => {
    // Player center at 114, zone center at 150 => knockbackDir = -1 (push left)
    const player = makePlayer({ x: 100, y: 400 });
    const zones: HazardZone[] = [{
      x: 80, y: 390, width: 140, height: 60, type: 'lava',
    }];
    const result = checkHazardZoneCollision(player, zones);
    expect(result).not.toBeNull();
    expect(result!.knockbackDir).toBe(-1);
  });

  it('lava does NOT hit invincible players', () => {
    const player = makePlayer({ invincibleTimer: 1.5 });
    const zones: HazardZone[] = [{
      x: 80, y: 390, width: 140, height: 60, type: 'lava',
    }];
    const result = checkHazardZoneCollision(player, zones);
    expect(result).toBeNull();
  });

  it('lava does NOT hit already-affected players (slowTimer > 0)', () => {
    // A player already affected by a hazard (slowTimer > 0) is not hit again.
    // This prevents double-hits while the slow debuff is active.
    const player = makePlayer({ slowTimer: 3.0 });
    const zones: HazardZone[] = [{
      x: 80, y: 390, width: 140, height: 60, type: 'lava',
    }];
    const result = checkHazardZoneCollision(player, zones);
    expect(result).toBeNull();
  });
});

describe('Hazard Zone Collision Inset', () => {
  it('player at the very edge of a hazard zone (within 12px inset) is NOT affected', () => {
    // Zone: x=200, width=100. With 12px inset, effective zone is x=212..288.
    // Player: width=32. Place player so right edge just touches zone left edge but
    // doesn't reach the 12px-inset boundary.
    // Player at x=185 => right edge at 185+32=217 > 212 => overlap with inset zone.
    // Player at x=181 => right edge at 181+32=213 > 212 => barely overlap.
    // Player at x=179 => right edge at 179+32=211 < 212 => no overlap.
    const zones: HazardZone[] = [{
      x: 200, y: 390, width: 100, height: 60, type: 'lava',
    }];

    // Player at x=179: right edge at 211, inset zone starts at 212 => no overlap
    const playerOutside = makePlayer({ x: 179, y: 400 });
    expect(checkHazardZoneCollision(playerOutside, zones)).toBeNull();
  });

  it('player deeper than 12px inside the zone IS affected', () => {
    // Zone: x=200, width=100. Effective inset zone: x=212..288.
    // Player at x=220 => left edge at 220, right edge at 252. Both inside 212..288.
    const zones: HazardZone[] = [{
      x: 200, y: 390, width: 100, height: 60, type: 'lava',
    }];

    const playerInside = makePlayer({ x: 220, y: 400 });
    const result = checkHazardZoneCollision(playerInside, zones);
    expect(result).not.toBeNull();
    expect(result!.zone.type).toBe('lava');
  });

  it('inset is exactly 12px on each side', () => {
    // Zone: x=100, width=50. Effective: x=112, width=26 (50 - 24). Right edge = 138.
    // Player (width=32) at x=105 => right edge 137 > 112 and left 105 < 138 => overlap.
    // Player at x=107 => right edge 139 > 112 and left 107 < 138 => overlap.
    // Player at x=139 => left 139 > 138 => no overlap (player is past right inset boundary).
    const zones: HazardZone[] = [{
      x: 100, y: 390, width: 50, height: 60, type: 'lava',
    }];

    // Overlapping the inset zone
    const playerOverlap = makePlayer({ x: 107, y: 400 });
    expect(checkHazardZoneCollision(playerOverlap, zones)).not.toBeNull();

    // Past the right inset edge
    const playerPastRight = makePlayer({ x: 139, y: 400 });
    expect(checkHazardZoneCollision(playerPastRight, zones)).toBeNull();
  });
});

describe('Thorn Growth', () => {
  it('thorns with growTimer > 0 do not affect players (still growing)', () => {
    const player = makePlayer();
    const thorns = [makeThorn({ growTimer: 0.3 })];
    const result = checkThornCollision(player, thorns);
    expect(result).toBeNull();
  });

  it('already-hit thorns (hit=true) do not affect players again', () => {
    const player = makePlayer();
    const thorns = [makeThorn({ hit: true })];
    const result = checkThornCollision(player, thorns);
    expect(result).toBeNull();
  });

  it('thorn slow duration is THORN_SLOW_DURATION (5 seconds)', () => {
    // Verify the constant value used by gameLoop when applying thorn effect.
    // This ensures the constant hasn't been accidentally changed.
    expect(THORN_SLOW_DURATION).toBe(5);
  });

  it('fully grown thorn (growTimer <= 0, hit=false) DOES affect players', () => {
    const player = makePlayer();
    const thorns = [makeThorn({ growTimer: 0, hit: false })];
    const result = checkThornCollision(player, thorns);
    expect(result).not.toBeNull();
    expect(result!.thornIndex).toBe(0);
  });

  it('thorn with growTimer exactly 0 is active', () => {
    const player = makePlayer();
    const thorns = [makeThorn({ growTimer: 0 })];
    const result = checkThornCollision(player, thorns);
    expect(result).not.toBeNull();
  });
});

describe('Spring Cooldown Edge Cases', () => {
  it('spring with bounceTimer > 0 does NOT bounce the player', () => {
    const player = makePlayer({ vy: 10 }); // falling down
    const springs = [makeSpring({ bounceTimer: 0.15 })]; // still in cooldown
    const result = checkSpringCollision(player, springs);
    expect(result).toBeNull();
  });

  it('spring with bounceTimer exactly 0 DOES bounce the player', () => {
    const player = makePlayer({ vy: 10 });
    const springs = [makeSpring({ bounceTimer: 0 })];
    const result = checkSpringCollision(player, springs);
    expect(result).not.toBeNull();
  });

  it('multiple springs: first in cooldown, second still works', () => {
    const player = makePlayer({ vy: 10 });
    // First spring at same position but in cooldown, second at same position but ready
    const springs = [
      makeSpring({ x: 110, y: 440, bounceTimer: 0.2 }), // cooldown
      makeSpring({ x: 110, y: 440, bounceTimer: 0 }),    // ready
    ];
    const result = checkSpringCollision(player, springs);
    expect(result).not.toBeNull();
    expect(result!.springIndex).toBe(1); // second spring (index 1) is the one that fires
  });

  it('multiple springs: player bounces on first, second spring independently available', () => {
    const player = makePlayer({ vy: 10 });
    // Simulate: first spring was just bounced (cooldown), second spring is at a different location and ready
    const springs = [
      makeSpring({ x: 110, y: 440, bounceTimer: 0.3 }),  // just bounced
      makeSpring({ x: 300, y: 500, bounceTimer: 0 }),     // far away, ready
    ];
    // Player is near first spring (110, 440) but it's in cooldown
    // Player is NOT near second spring (300, 500)
    const result = checkSpringCollision(player, springs);
    expect(result).toBeNull(); // first is cooldown, second is out of range

    // Move player near second spring
    const player2 = makePlayer({ x: 288, y: 460, vy: 10 }); // near (300, 500)
    const result2 = checkSpringCollision(player2, springs);
    expect(result2).not.toBeNull();
    expect(result2!.springIndex).toBe(1);
  });
});

// ============================================================
// Additional coverage tests
// ============================================================

describe('checkLavaRockCollision — extended', () => {
  it('active lava rock colliding with player returns hit result', () => {
    // Player center at (116, 416). Rock at (120, 420), size=12.
    // hitDist = 12 + 32*0.3 = 21.6. dx=116-120=-4, dy=416-420=-4. dist^2=32 < 21.6^2=466.56
    const player = makePlayer({ x: 100, y: 400 });
    const rocks = [makeLavaRock({ x: 120, y: 420, active: true, size: 12 })];
    const result = checkLavaRockCollision(player, rocks);
    expect(result).not.toBeNull();
    expect(result!.rockIndex).toBe(0);
  });

  it('inactive lava rock does not hit', () => {
    const player = makePlayer({ x: 100, y: 400 });
    const rocks = [makeLavaRock({ x: 120, y: 420, active: false })];
    const result = checkLavaRockCollision(player, rocks);
    expect(result).toBeNull();
  });

  it('invincible player not hit by lava rock', () => {
    const player = makePlayer({ x: 100, y: 400, invincibleTimer: 2.0 });
    const rocks = [makeLavaRock({ x: 120, y: 420, active: true })];
    const result = checkLavaRockCollision(player, rocks);
    expect(result).toBeNull();
  });

  it('already-slowed player not hit by lava rock', () => {
    const player = makePlayer({ x: 100, y: 400, slowTimer: 3.0 });
    const rocks = [makeLavaRock({ x: 120, y: 420, active: true })];
    const result = checkLavaRockCollision(player, rocks);
    expect(result).toBeNull();
  });

  it('knockback direction is +1 when player is to the right of rock', () => {
    // Player at (140, 400), center = (156, 416). Rock at (150, 415).
    // dx = 156-150 = 6 > 0 => knockbackDir = 1
    const player = makePlayer({ x: 140, y: 400 });
    const rocks = [makeLavaRock({ x: 150, y: 415, active: true, size: 14 })];
    const result = checkLavaRockCollision(player, rocks);
    expect(result).not.toBeNull();
    expect(result!.knockbackDir).toBe(1);
  });

  it('knockback direction is -1 when player is to the left of rock', () => {
    // Player at (100, 400), center = (116, 416). Rock at (130, 416).
    // dx = 116-130 = -14 < 0 => knockbackDir = -1
    const player = makePlayer({ x: 100, y: 400 });
    const rocks = [makeLavaRock({ x: 130, y: 416, active: true, size: 14 })];
    const result = checkLavaRockCollision(player, rocks);
    expect(result).not.toBeNull();
    expect(result!.knockbackDir).toBe(-1);
  });

  it('multiple rocks: only first active overlapping rock is returned', () => {
    const player = makePlayer({ x: 100, y: 400 }); // center = (116, 416)
    const rocks = [
      makeLavaRock({ x: 800, y: 800, active: true }), // far away
      makeLavaRock({ x: 116, y: 416, active: true, size: 12 }), // overlapping
      makeLavaRock({ x: 117, y: 417, active: true, size: 12 }), // also overlapping
    ];
    const result = checkLavaRockCollision(player, rocks);
    expect(result).not.toBeNull();
    expect(result!.rockIndex).toBe(1); // first match in iteration order
  });
});

describe('checkHazardZoneCollision — extended', () => {
  it('multiple hazard zones: player inside one but not the other', () => {
    const player = makePlayer({ x: 100, y: 400 }); // AABB: (100, 400, 32, 32)
    const zones: HazardZone[] = [
      { x: 500, y: 500, width: 100, height: 50, type: 'lava' }, // far away
      { x: 80, y: 390, width: 140, height: 60, type: 'lava' },  // overlapping
    ];
    const result = checkHazardZoneCollision(player, zones);
    expect(result).not.toBeNull();
    // Should match the second zone (index 1 in array, first overlap found)
    expect(result!.zone).toBe(zones[1]);
  });

  it('large hazard zone covering entire arena', () => {
    const player = makePlayer({ x: 600, y: 350 });
    const zones: HazardZone[] = [
      { x: 0, y: 0, width: 1280, height: 720, type: 'lava' },
    ];
    const result = checkHazardZoneCollision(player, zones);
    expect(result).not.toBeNull();
    expect(result!.zone.type).toBe('lava');
  });

  it('very small hazard zone smaller than inset threshold still collides due to inverted AABB', () => {
    // Zone: x=110, width=10 => with 12px inset each side, effective x=122, width=-14.
    // aabbOverlap with negative width creates an inverted AABB (right=108 < left=122).
    // Due to aabbOverlap's strict inequality checks, a player straddling this inverted
    // range can still match: ax(100) < bx+bw(108) && ax+aw(132) > bx(122) => both true.
    // This means very narrow zones (< 24px) behave unexpectedly — they still trigger.
    const player = makePlayer({ x: 100, y: 400 });
    const zones: HazardZone[] = [
      { x: 110, y: 400, width: 10, height: 32, type: 'lava' },
    ];
    const result = checkHazardZoneCollision(player, zones);
    // Inverted AABB still produces a collision — the inset doesn't fully protect here
    expect(result).not.toBeNull();
  });

  it('very small hazard zone does NOT collide when player is far outside', () => {
    // Even with inverted AABB from narrow zone, a distant player won't overlap
    const player = makePlayer({ x: 500, y: 400 });
    const zones: HazardZone[] = [
      { x: 110, y: 400, width: 10, height: 32, type: 'lava' },
    ];
    const result = checkHazardZoneCollision(player, zones);
    expect(result).toBeNull();
  });

  it('player partially inside zone (one edge in, one out)', () => {
    // Zone: x=120, width=200. Effective after inset: x=132, width=176, right=308.
    // Player at x=100, width=32: right=132. Overlap: 100 < 308 && 132 > 132 => 132 > 132 is false.
    // So player right edge exactly at inset left edge = no overlap (strict inequality).
    // Player at x=101: right=133 > 132 => overlap.
    const zones: HazardZone[] = [
      { x: 120, y: 390, width: 200, height: 60, type: 'lava' },
    ];

    // Right edge exactly at inset boundary (132) => no overlap (strict </>)
    const playerEdge = makePlayer({ x: 100, y: 400 });
    expect(checkHazardZoneCollision(playerEdge, zones)).toBeNull();

    // 1px deeper => overlap
    const playerPartial = makePlayer({ x: 101, y: 400 });
    const result = checkHazardZoneCollision(playerPartial, zones);
    expect(result).not.toBeNull();
  });

  it('zone type field preserved in result', () => {
    const player = makePlayer({ x: 100, y: 400 });
    const zones: HazardZone[] = [
      { x: 80, y: 390, width: 140, height: 60, type: 'lava' },
    ];
    const result = checkHazardZoneCollision(player, zones);
    expect(result).not.toBeNull();
    expect(result!.zone.type).toBe('lava');
    // The zone object itself is the same reference
    expect(result!.zone).toBe(zones[0]);
  });
});

describe('checkSpringCollision — position matching', () => {
  it('spring must overlap player horizontally AND vertically', () => {
    // Spring at (200, 440): AABB = (190, 420, 20, 20).
    // Player at (100, 400), width=32, height=32: AABB = (100, 400, 32, 32).
    // Horizontal: 100 < 210 but 132 > 190? 132 < 190 => false. No horizontal overlap.
    const player = makePlayer({ x: 100, y: 400, vy: 10 });
    const springs = [makeSpring({ x: 200, y: 440 })];
    const result = checkSpringCollision(player, springs);
    expect(result).toBeNull();
  });

  it('player far above spring — no collision', () => {
    // Spring at (110, 440): AABB = (100, 420, 20, 20). Spring top=420, bottom=440.
    // Player at (100, 100), bottom = 132. Far above spring top (420).
    const player = makePlayer({ x: 100, y: 100, vy: 10 });
    const springs = [makeSpring({ x: 110, y: 440 })];
    const result = checkSpringCollision(player, springs);
    expect(result).toBeNull();
  });

  it('player exactly on top of spring — collision', () => {
    // Spring at (110, 440): AABB = (100, 420, 20, 20).
    // Player at (100, 400), bottom = 432. 400 < 440 && 432 > 420 => overlap vertically.
    // Horizontal: 100 < 120 && 132 > 100 => overlap. Player falling => vy >= 0.
    const player = makePlayer({ x: 100, y: 400, vy: 5 });
    const springs = [makeSpring({ x: 110, y: 440 })];
    const result = checkSpringCollision(player, springs);
    expect(result).not.toBeNull();
    expect(result!.springIndex).toBe(0);
  });
});

describe('checkThornCollision — detailed', () => {
  it('thorn with hit=true already — no collision', () => {
    const player = makePlayer();
    const thorns = [makeThorn({ hit: true, growTimer: 0 })];
    const result = checkThornCollision(player, thorns);
    expect(result).toBeNull();
  });

  it('thorn with growTimer=0.001 (almost grown but not 0) — no collision', () => {
    // growTimer > 0 means still growing, even if barely
    const player = makePlayer();
    const thorns = [makeThorn({ growTimer: 0.001, hit: false })];
    const result = checkThornCollision(player, thorns);
    expect(result).toBeNull();
  });

  it('thorn with growTimer=0 and hit=false — collision detected', () => {
    // Fully grown, not yet hit — should collide.
    // Default thorn at (95, 410, 16, 20). Player at (100, 400, 32, 32).
    // Player AABB: (100, 400)-(132, 432). Thorn AABB: (95, 410)-(111, 430).
    // Overlap: 100 < 111 && 132 > 95 && 400 < 430 && 432 > 410 => all true.
    const player = makePlayer();
    const thorns = [makeThorn({ growTimer: 0, hit: false })];
    const result = checkThornCollision(player, thorns);
    expect(result).not.toBeNull();
    expect(result!.thornIndex).toBe(0);
  });

  it('thorn collision does not mutate thorn state (pure function)', () => {
    // checkThornCollision is a pure collision detector — it does NOT set thorn.hit = true.
    // That side effect is handled by the GameLoop.
    const player = makePlayer();
    const thorn = makeThorn({ growTimer: 0, hit: false });
    const thorns = [thorn];
    const result = checkThornCollision(player, thorns);
    expect(result).not.toBeNull();
    // thorn.hit should still be false — collision detection is side-effect-free
    expect(thorn.hit).toBe(false);
  });
});
