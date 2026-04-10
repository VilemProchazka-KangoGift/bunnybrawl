import { describe, it, expect } from 'vitest';
import {
  checkSpringCollision,
  checkThornCollision,
  checkHazardZoneCollision,
  checkGhostCollision,
  checkLavaRockCollision,
} from './hazardCollision';
import type { Player, SpringMushroom, Thorn, GhostEntity, LavaRock, HazardZone } from './types';
import { PLAYER_WIDTH, PLAYER_HEIGHT, SPRING_SIZE } from './constants';
import { CHARACTERS } from './characters';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'P1',
    character: CHARACTERS.P1,
    x: 100,
    y: 400,
    vx: 0,
    vy: 0,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    state: 'idle',
    facing: 'right',
    splatTimer: 0,
    respawnTimer: 0,
    invincibleTimer: 0,
    score: 0,
    active: true,
    animFrame: 0,
    animTimer: 0,
    fastFalling: false,
    fatTimer: 0,
    slowTimer: 0,
    sideSquash: 1,
    burnTimer: 0,
    hitstopTimer: 0,
    ...overrides,
  };
}

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
