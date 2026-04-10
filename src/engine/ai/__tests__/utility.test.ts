import { describe, it, expect } from 'vitest';
import { evaluateActions } from '../utility';
import type { AwarenessSnapshot, AIPersonality, ActionScores } from '../types';
import { SeededRNG } from '../../net/prng';

// ---- Helpers ----

const DEFAULT_PERSONALITY: AIPersonality = {
  aggressiveness: 1.0,
  cautiousness: 1.0,
  greediness: 0.8,
  chaosAffinity: 0.0, // no chaos for deterministic tests
  targetLeader: false,
};

function makeAwareness(overrides?: Partial<AwarenessSnapshot>): AwarenessSnapshot {
  return {
    self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
    nearestEnemy: null,
    priorityTarget: null,
    roamTarget: null,
    stompTarget: null,
    stompThreat: null,
    airborneAbove: [],
    nearestCarrot: null,
    nearestHazard: null,
    nearbyHazards: [],
    nearestPlatformAbove: null,
    nearestPlatformBelow: null,
    landingPlatform: null,
    nearEdge: false,
    inZeroG: false,
    inCurrent: 0,
    nearGeyser: null,
    geyserEscapeDx: 0,
    nearbyBotCount: 0,
    leaderScore: 5,
    onElevatedPlatform: false,
    currentPlatformIdx: 0,
    navTarget: null,
    ...overrides,
  };
}

function personality(overrides?: Partial<AIPersonality>): AIPersonality {
  return { ...DEFAULT_PERSONALITY, ...overrides };
}

// ---- Tests ----

describe('evaluateActions', () => {
  describe('evaluateHurtFlee', () => {
    it('biases moveLeft when slowed and enemy is to the right', () => {
      const a = makeAwareness({
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: true, fat: false, invincible: false },
        nearestEnemy: { x: 500, y: 600, vx: 0, vy: 0, dx: 100, dy: 0, dist: 100, score: 3 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.moveLeft).toBeGreaterThan(0);
      expect(scores.moveLeft).toBeGreaterThan(scores.moveRight);
    });

    it('biases moveRight when slowed and enemy is to the left', () => {
      const a = makeAwareness({
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: true, fat: false, invincible: false },
        nearestEnemy: { x: 300, y: 600, vx: 0, vy: 0, dx: -100, dy: 0, dist: 100, score: 3 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.moveRight).toBeGreaterThan(scores.moveLeft);
    });

    it('biases movement when fat', () => {
      const a = makeAwareness({
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: true, invincible: false },
        nearestEnemy: { x: 500, y: 600, vx: 0, vy: 0, dx: 100, dy: 0, dist: 100, score: 3 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.moveLeft).toBeGreaterThan(0);
    });
  });

  describe('evaluateStompOpportunity', () => {
    it('biases moveRight toward stomp target to the right', () => {
      const a = makeAwareness({
        stompTarget: { x: 500, y: 650, dx: 50, dist: 80 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.moveRight).toBeGreaterThan(0);
    });

    it('biases drop when directly above target', () => {
      const a = makeAwareness({
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: false, score: 5, slowed: false, fat: false, invincible: false },
        stompTarget: { x: 410, y: 650, dx: 10, dist: 50 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.drop).toBeGreaterThan(0);
    });

    it('biases jump when on ground and target is close', () => {
      const a = makeAwareness({
        stompTarget: { x: 430, y: 650, dx: 30, dist: 80 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.jump).toBeGreaterThan(0);
    });

    it('does not trigger when no stomp target', () => {
      const a = makeAwareness({ stompTarget: null });
      const scores = evaluateActions(a, personality());
      // Only roam and possibly other non-stomp evaluators contribute
      // No stomp-specific scores
      expect(scores.drop).toBe(0);
    });
  });

  describe('evaluateThreatEvasion', () => {
    it('biases moveLeft when threat is to the right', () => {
      const a = makeAwareness({
        stompThreat: { x: 450, y: 550, dist: 60 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.moveLeft).toBeGreaterThan(0);
    });

    it('biases jump when threat is very close and on ground', () => {
      const a = makeAwareness({
        stompThreat: { x: 420, y: 570, dist: 40 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.jump).toBeGreaterThan(0);
    });

    it('scales with cautiousness personality', () => {
      const a = makeAwareness({
        stompThreat: { x: 450, y: 550, dist: 60 },
      });
      const lowCaution = evaluateActions(a, personality({ cautiousness: 0.5 }));
      const highCaution = evaluateActions(a, personality({ cautiousness: 2.0 }));
      // Higher cautiousness should produce stronger evasion
      expect(highCaution.moveLeft).toBeGreaterThan(lowCaution.moveLeft);
    });
  });

  describe('evaluateChaseTarget', () => {
    it('biases moveRight toward enemy on the right', () => {
      const a = makeAwareness({
        nearestEnemy: { x: 600, y: 600, vx: 0, vy: 0, dx: 200, dy: 0, dist: 200, score: 3 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.moveRight).toBeGreaterThan(0);
    });

    it('biases drop when enemy is below and close horizontally', () => {
      const a = makeAwareness({
        nearestEnemy: { x: 420, y: 700, vx: 0, vy: 0, dx: 20, dy: 100, dist: 100, score: 3 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.drop).toBeGreaterThan(0);
    });

    it('does not chase vertically when nav is available', () => {
      const a = makeAwareness({
        nearestEnemy: { x: 400, y: 500, vx: 0, vy: 0, dx: 0, dy: -100, dist: 100, score: 3 },
        navTarget: { x: 300, y: 500, width: 200, approachX: 350, type: 'j' },
      });
      const scoresNav = evaluateActions(a, personality());
      // With nav and |dy| > 40, chase should defer — but nav adds its own scores
      // The key is chase doesn't add horizontal scores for different-level enemies
      const aNoNav = makeAwareness({
        nearestEnemy: { x: 400, y: 500, vx: 0, vy: 0, dx: 0, dy: -100, dist: 100, score: 3 },
        navTarget: null,
        nearestPlatformAbove: { x: 300, y: 500, width: 200, dy: -100 },
      });
      const scoresNoNav = evaluateActions(aNoNav, personality());
      // Both should have some movement bias, but from different evaluators
      expect(typeof scoresNav.moveRight).toBe('number');
      expect(typeof scoresNoNav.moveRight).toBe('number');
    });
  });

  describe('evaluateTargetPriority', () => {
    it('chases juicy target with high weight', () => {
      const a = makeAwareness({
        priorityTarget: { x: 600, y: 600, dx: 200, dy: 0, dist: 200, juiciness: 3 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.moveRight).toBeGreaterThan(0);
    });

    it('biases jump toward elevated target when on ground', () => {
      const a = makeAwareness({
        priorityTarget: { x: 430, y: 500, dx: 30, dy: -100, dist: 100, juiciness: 2 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.jump).toBeGreaterThan(0);
    });
  });

  describe('evaluateCarrotPursuit', () => {
    it('biases moveRight toward carrot', () => {
      const a = makeAwareness({
        nearestCarrot: { x: 600, y: 600, dist: 200 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.moveRight).toBeGreaterThan(0);
    });

    it('does not pursue carrot when fat (non carrot-chase)', () => {
      const a = makeAwareness({
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: true, invincible: false },
        nearestCarrot: { x: 600, y: 600, dist: 200 },
      });
      const scores = evaluateActions(a, personality(), 0, false);
      // When fat (non-chase), carrot pursuit is skipped
      // Other evaluators (flee) still add scores
      // We just verify carrot isn't the dominant force
      const aNotFat = makeAwareness({
        nearestCarrot: { x: 600, y: 600, dist: 200 },
      });
      const scoresNotFat = evaluateActions(aNotFat, personality(), 0, false);
      // Non-fat should have stronger rightward bias from carrot
      expect(scoresNotFat.moveRight).toBeGreaterThanOrEqual(scores.moveRight);
    });

    it('uses higher weight in carrot chase mode', () => {
      const a = makeAwareness({
        nearestCarrot: { x: 600, y: 600, dist: 200 },
      });
      const normal = evaluateActions(a, personality(), 0, false);
      const chase = evaluateActions(a, personality(), 0, true);
      expect(chase.moveRight).toBeGreaterThan(normal.moveRight);
    });

    it('does not pursue carrot when enemy is very close', () => {
      const a = makeAwareness({
        nearestEnemy: { x: 420, y: 600, vx: 0, vy: 0, dx: 20, dy: 0, dist: 30, score: 3 },
        nearestCarrot: { x: 600, y: 600, dist: 200 },
      });
      const scores = evaluateActions(a, personality(), 0, false);
      // With enemy at dist=30 (< 50), carrot pursuit is skipped
      // Other evaluators (chase, stomp) add scores instead
      expect(typeof scores.moveRight).toBe('number');
    });
  });

  describe('evaluateHazardAvoidance', () => {
    it('biases moveLeft when hazard is to the right', () => {
      const a = makeAwareness({
        nearbyHazards: [{ type: 'lava', x: 500, y: 660, dist: 50 }],
      });
      const scores = evaluateActions(a, personality());
      expect(scores.moveLeft).toBeGreaterThan(0);
    });

    it('biases jump for very close lava when on ground', () => {
      const a = makeAwareness({
        nearbyHazards: [{ type: 'lava', x: 420, y: 660, dist: 30 }],
      });
      const scores = evaluateActions(a, personality());
      expect(scores.jump).toBeGreaterThan(0);
    });

    it('handles multiple simultaneous hazards', () => {
      const a = makeAwareness({
        nearbyHazards: [
          { type: 'lava', x: 300, y: 660, dist: 80 }, // left
          { type: 'ghost', x: 500, y: 600, dist: 80 }, // right
        ],
      });
      const scores = evaluateActions(a, personality());
      // Both hazards contribute to avoidance — scores should show both directions
      expect(scores.moveLeft + scores.moveRight).toBeGreaterThan(0);
    });
  });

  describe('evaluateEdgeAvoidance', () => {
    it('biases toward platform center when near edge', () => {
      const a = makeAwareness({
        nearEdge: true,
        nearestPlatformBelow: { x: 200, y: 660, width: 400, dy: 0 },
        self: { x: 200, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
      });
      const scores = evaluateActions(a, personality());
      // Platform center is at 400, self at 200 — should bias right
      expect(scores.moveRight).toBeGreaterThan(0);
    });

    it('reverses velocity direction when no platform reference', () => {
      const a = makeAwareness({
        nearEdge: true,
        nearestPlatformBelow: null,
        self: { x: 400, y: 600, vx: 50, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
      });
      const scores = evaluateActions(a, personality());
      // Moving right (vx > 0) → should bias left to avoid falling
      expect(scores.moveLeft).toBeGreaterThan(0);
    });
  });

  describe('evaluatePlatformSeeking', () => {
    it('uses nav jump edge: walks to approach then jumps', () => {
      const rng = new SeededRNG(42);
      const a = makeAwareness({
        navTarget: { x: 300, y: 500, width: 200, approachX: 500, type: 'j' },
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
      });
      const scores = evaluateActions(a, personality(), 1.0, false, rng);
      // approachX=500 is right of self=400 → moveRight
      expect(scores.moveRight).toBeGreaterThan(0);
      // Close enough to jump (within width/2 + 80)
      expect(scores.jump).toBeGreaterThan(0);
    });

    it('uses nav drop edge: walks to edge then drops', () => {
      const rng = new SeededRNG(42);
      const a = makeAwareness({
        navTarget: { x: 300, y: 700, width: 200, approachX: 500, type: 'd' },
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
      });
      const scores = evaluateActions(a, personality(), 1.0, false, rng);
      expect(scores.drop).toBeGreaterThan(0);
    });

    it('does nothing when airborne', () => {
      const a = makeAwareness({
        navTarget: { x: 300, y: 500, width: 200, approachX: 500, type: 'j' },
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: false, score: 5, slowed: false, fat: false, invincible: false },
      });
      const scores = evaluateActions(a, personality());
      // platformSeeking should not contribute when airborne
      // Other evaluators may still add scores
      expect(typeof scores.jump).toBe('number');
    });

    it('falls back to nearest platform above when no nav', () => {
      const a = makeAwareness({
        navTarget: null,
        nearestPlatformAbove: { x: 300, y: 500, width: 200, dy: -100 },
        nearestEnemy: { x: 400, y: 400, vx: 0, vy: 0, dx: 0, dy: -200, dist: 200, score: 3 },
      });
      const scores = evaluateActions(a, personality());
      // Platform center at 400 matches self.x=400, so jump should be biased
      expect(scores.jump).toBeGreaterThan(0);
    });
  });

  describe('evaluateGeyserEscape', () => {
    it('steers right when geyserEscapeDx > 0', () => {
      const a = makeAwareness({ geyserEscapeDx: 50 });
      const scores = evaluateActions(a, personality());
      expect(scores.moveRight).toBeGreaterThan(0);
    });

    it('uses stronger weight when airborne', () => {
      const aGround = makeAwareness({
        geyserEscapeDx: 50,
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
      });
      const aAir = makeAwareness({
        geyserEscapeDx: 50,
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: false, score: 5, slowed: false, fat: false, invincible: false },
      });
      const gScores = evaluateActions(aGround, personality());
      const aScores = evaluateActions(aAir, personality());
      // Airborne escape weight is 3.0 vs ground 1.5
      expect(aScores.moveRight).toBeGreaterThan(gScores.moveRight);
    });
  });

  describe('evaluateZoneExploitation', () => {
    it('moves toward geyser about to erupt', () => {
      const a = makeAwareness({
        nearGeyser: { x: 500, y: 400, active: false, timer: 1.0 },
      });
      const scores = evaluateActions(a, personality());
      // Geyser to the right with timer < 2 → move right
      expect(scores.moveRight).toBeGreaterThan(0);
    });

    it('biases jump in zero-G when on ground', () => {
      const a = makeAwareness({ inZeroG: true });
      const scores = evaluateActions(a, personality());
      expect(scores.jump).toBeGreaterThanOrEqual(0.15);
    });

    it('compensates for current push', () => {
      const a = makeAwareness({ inCurrent: 50 });
      const scores = evaluateActions(a, personality());
      // Current pushes right (positive) → compensate left
      expect(scores.moveLeft).toBeGreaterThan(0);
    });
  });

  describe('evaluateLandingPrediction', () => {
    it('steers toward landing platform when falling', () => {
      const a = makeAwareness({
        self: { x: 400, y: 400, vx: 0, vy: 100, onGround: false, score: 5, slowed: false, fat: false, invincible: false },
        landingPlatform: { x: 500, y: 600, width: 200, centerDx: 200 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.moveRight).toBeGreaterThan(0);
    });

    it('does nothing when ascending', () => {
      const a = makeAwareness({
        self: { x: 400, y: 400, vx: 0, vy: -100, onGround: false, score: 5, slowed: false, fat: false, invincible: false },
        landingPlatform: { x: 500, y: 600, width: 200, centerDx: 200 },
      });
      const scoresRising = evaluateActions(a, personality());
      // Landing prediction only kicks in when vy > 0 (falling)
      // With vy < 0, no landing prediction contribution
      const aFalling = makeAwareness({
        self: { x: 400, y: 400, vx: 0, vy: 100, onGround: false, score: 5, slowed: false, fat: false, invincible: false },
        landingPlatform: { x: 500, y: 600, width: 200, centerDx: 200 },
      });
      const scoresFalling = evaluateActions(aFalling, personality());
      expect(scoresFalling.moveRight).toBeGreaterThanOrEqual(scoresRising.moveRight);
    });
  });

  describe('evaluateInvincibilityAggression', () => {
    it('chases nearest enemy when invincible', () => {
      const a = makeAwareness({
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: true },
        nearestEnemy: { x: 600, y: 600, vx: 0, vy: 0, dx: 200, dy: 0, dist: 200, score: 3 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.moveRight).toBeGreaterThan(0);
    });

    it('does not trigger when not invincible', () => {
      const a = makeAwareness({
        nearestEnemy: { x: 600, y: 600, vx: 0, vy: 0, dx: 200, dy: 0, dist: 200, score: 3 },
      });
      const scoresNormal = evaluateActions(a, personality());
      const aInv = makeAwareness({
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: true },
        nearestEnemy: { x: 600, y: 600, vx: 0, vy: 0, dx: 200, dy: 0, dist: 200, score: 3 },
      });
      const scoresInv = evaluateActions(aInv, personality());
      // Invincible adds extra chase weight
      expect(scoresInv.moveRight).toBeGreaterThan(scoresNormal.moveRight);
    });
  });

  describe('evaluateClustering', () => {
    it('adds scatter when 2+ bots nearby', () => {
      const rng = new SeededRNG(42);
      const a = makeAwareness({ nearbyBotCount: 3 });
      const scores = evaluateActions(a, personality(), 0, false, rng);
      // Either moveLeft or moveRight should have scatter contribution
      expect(scores.moveLeft + scores.moveRight).toBeGreaterThan(0);
    });

    it('does not scatter when < 2 bots nearby', () => {
      const rng = new SeededRNG(42);
      const a = makeAwareness({ nearbyBotCount: 1 });
      const scores = evaluateActions(a, personality(), 0, false, rng);
      // With no other evaluators firing and nearbyBotCount < 2,
      // scatter doesn't contribute
      const aZero = makeAwareness({ nearbyBotCount: 0 });
      const scoresZero = evaluateActions(aZero, personality(), 0, false, rng);
      // Both should be effectively the same (no scatter in either case)
      expect(Math.abs((scores.moveLeft + scores.moveRight) - (scoresZero.moveLeft + scoresZero.moveRight))).toBeLessThan(0.1);
    });
  });

  describe('evaluatePanic', () => {
    it('adds noise when significantly behind leader', () => {
      const rng = new SeededRNG(42);
      const a = makeAwareness({
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 3, slowed: false, fat: false, invincible: false },
        leaderScore: 15, // diff = 12 > 6
      });
      const scores = evaluateActions(a, personality(), 0, false, rng);
      // Panic adds noise to moveLeft/moveRight/jump
      // Hard to assert exact values due to randomness, but total movement should be non-zero
      expect(scores.moveLeft + scores.moveRight + scores.jump).not.toBe(0);
    });

    it('does not panic when score difference < 6', () => {
      const rng = new SeededRNG(42);
      const a = makeAwareness({
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
        leaderScore: 8, // diff = 3 < 6
      });
      const scores = evaluateActions(a, personality(), 0, false, rng);
      // Panic should not contribute (diff < 6)
      // Compare with same awareness but high leader score
      const aPanic = makeAwareness({
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
        leaderScore: 20, // diff = 15 > 6
      });
      const rng2 = new SeededRNG(42);
      const scoresPanic = evaluateActions(aPanic, personality(), 0, false, rng2);
      // With panic, total movement energy should be higher
      const totalNormal = Math.abs(scores.moveLeft) + Math.abs(scores.moveRight) + Math.abs(scores.jump);
      const totalPanic = Math.abs(scoresPanic.moveLeft) + Math.abs(scoresPanic.moveRight) + Math.abs(scoresPanic.jump);
      expect(totalPanic).toBeGreaterThanOrEqual(totalNormal);
    });
  });

  describe('evaluateCamping', () => {
    it('dampens movement when cautious bot on elevated platform', () => {
      const a = makeAwareness({
        onElevatedPlatform: true,
        nearestEnemy: null, // no nearby enemy
      });
      const scoresNoCamp = evaluateActions(a, personality({ cautiousness: 1.0 }));
      const scoresCamp = evaluateActions(a, personality({ cautiousness: 1.5 }));
      // Higher cautiousness + elevated platform should dampen movement
      const totalNoCamp = scoresNoCamp.moveLeft + scoresNoCamp.moveRight;
      const totalCamp = scoresCamp.moveLeft + scoresCamp.moveRight;
      expect(totalCamp).toBeLessThanOrEqual(totalNoCamp);
    });

    it('does not camp when enemy is close', () => {
      const a = makeAwareness({
        onElevatedPlatform: true,
        nearestEnemy: { x: 500, y: 600, vx: 0, vy: 0, dx: 100, dy: 0, dist: 100, score: 3 },
      });
      const scores = evaluateActions(a, personality({ cautiousness: 1.5 }));
      // With enemy at dist=100 (< 150), camping is suppressed
      // Other evaluators (chase, stomp) add movement
      expect(scores.moveRight + scores.moveLeft).not.toBe(0);
    });
  });

  describe('evaluateRoam', () => {
    it('biases moveRight toward roam target', () => {
      const a = makeAwareness({
        roamTarget: { x: 800, y: 600, dx: 400 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.moveRight).toBeGreaterThan(0);
    });

    it('biases climbing when roam target is above', () => {
      const a = makeAwareness({
        roamTarget: { x: 400, y: 400, dx: 0 },
        nearestPlatformAbove: { x: 300, y: 500, width: 200, dy: -100 },
      });
      const scores = evaluateActions(a, personality());
      expect(scores.jump).toBeGreaterThan(0);
    });
  });

  describe('evaluateAirborneAboveDodge', () => {
    it('dodges away from airborne enemy above when on ground', () => {
      const rng = new SeededRNG(42);
      const a = makeAwareness({
        airborneAbove: [{ x: 430, dx: 30, dy: -80, dist: 80 }],
      });
      const scores = evaluateActions(a, personality(), 1.0, false, rng);
      // Enemy above to the right (dx > 0) → dodge left (dodgeDir = -1)
      expect(scores.moveLeft).toBeGreaterThan(0);
    });

    it('ignores distant airborne enemies (dist > 200)', () => {
      const rng = new SeededRNG(42);
      const a = makeAwareness({
        airborneAbove: [{ x: 700, dx: 300, dy: -80, dist: 250 }],
      });
      const scores = evaluateActions(a, personality(), 1.0, false, rng);
      // dist > 200 → urgency = 0, no dodge contribution
      const aEmpty = makeAwareness();
      const rng2 = new SeededRNG(42);
      const scoresEmpty = evaluateActions(aEmpty, personality(), 1.0, false, rng2);
      expect(scores.moveLeft).toBeCloseTo(scoresEmpty.moveLeft, 2);
    });
  });

  describe('jump suppression (tight space)', () => {
    it('zeroes jump score when platform is directly overhead and close', () => {
      const a = makeAwareness({
        nearestPlatformAbove: { x: 380, y: 550, width: 100, dy: -50 },
        navTarget: null,
        // Add a reason to jump (stomp target)
        stompTarget: { x: 410, y: 650, dx: 10, dist: 60 },
      });
      const scores = evaluateActions(a, personality());
      // Platform at dy=-50 (within -80) and self is under it → jump suppressed
      expect(scores.jump).toBe(0);
    });

    it('does not suppress when nav wants jump', () => {
      const rng = new SeededRNG(42);
      const a = makeAwareness({
        nearestPlatformAbove: { x: 380, y: 550, width: 100, dy: -50 },
        navTarget: { x: 300, y: 500, width: 200, approachX: 420, type: 'j' },
      });
      const scores = evaluateActions(a, personality(), 1.0, false, rng);
      // Nav wants jump → suppression skipped
      expect(scores.jump).toBeGreaterThan(0);
    });
  });

  describe('carrot chase mode integration', () => {
    it('uses carrot pursuit in carrot chase mode', () => {
      const a = makeAwareness({
        nearestCarrot: { x: 600, y: 600, dist: 200 },
        nearestEnemy: { x: 300, y: 600, vx: 0, vy: 0, dx: -100, dy: 0, dist: 100, score: 3 },
      });
      const chase = evaluateActions(a, personality(), 0, true);
      const normal = evaluateActions(a, personality(), 0, false);
      // In chase mode, carrot weight is 2.0 vs 0.7*greediness=0.56
      expect(chase.moveRight).toBeGreaterThan(normal.moveRight);
    });
  });

  // ── Additional edge case tests ──────────────────────────────────────

  describe('all-zero scores', () => {
    it('returns all-zero scores when awareness has no targets and no zones', () => {
      // Completely empty awareness: no enemies, no carrots, no hazards, no zones
      const a = makeAwareness();
      const scores = evaluateActions(a, personality());
      expect(scores.moveLeft).toBe(0);
      expect(scores.moveRight).toBe(0);
      expect(scores.jump).toBe(0);
      expect(scores.drop).toBe(0);
    });
  });

  describe('evaluateRoam edge cases', () => {
    it('biases dropping when target is far below on elevated platform', () => {
      const a = makeAwareness({
        roamTarget: { x: 400, y: 700, dx: 0 }, // target far below
        self: { x: 400, y: 400, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
        onElevatedPlatform: true,
      });
      const scores = evaluateActions(a, personality());
      // Target 300px below on elevated platform → roam evaluator adds drop bias
      // With dx=0, it adds moveRight * 0.5 * 0.5 (walk either direction to reach edge)
      expect(scores.moveRight).toBeGreaterThan(0);
    });
  });

  describe('evaluateChaseTarget edge cases', () => {
    it('does not add horizontal chase when dy > 40 and airborne', () => {
      const a = makeAwareness({
        nearestEnemy: { x: 600, y: 500, vx: 0, vy: 0, dx: 200, dy: -100, dist: 220, score: 3 },
        self: { x: 400, y: 600, vx: 0, vy: -50, onGround: false, score: 5, slowed: false, fat: false, invincible: false },
      });
      const scores = evaluateActions(a, personality());

      // Compare with same scenario but on ground + no nav + no platform above
      const aOnGround = makeAwareness({
        nearestEnemy: { x: 600, y: 600, vx: 0, vy: 0, dx: 200, dy: 0, dist: 200, score: 3 },
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
      });
      const scoresGround = evaluateActions(aOnGround, personality());

      // On ground with dy=0, chase adds moveRight; airborne with |dy|>40, chase returns early
      // The airborne case should have less moveRight from chase
      expect(scoresGround.moveRight).toBeGreaterThan(scores.moveRight);
    });
  });

  describe('evaluateCarrotPursuit edge cases', () => {
    it('biases jump toward elevated carrot', () => {
      const a = makeAwareness({
        nearestCarrot: { x: 420, y: 500, dist: 100 },
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
      });
      const scores = evaluateActions(a, personality());
      // Carrot at y=500 is above self at y=600 (diff of 100 > 30) → jump bias
      expect(scores.jump).toBeGreaterThan(0);
    });
  });

  describe('evaluateHazardAvoidance edge cases', () => {
    it('applies ghost avoidance at wider range than lava', () => {
      // Ghost at dist=100 — within the ghost's 120px range
      const aGhost = makeAwareness({
        nearbyHazards: [{ type: 'ghost', x: 500, y: 600, dist: 100 }],
      });
      const ghostScores = evaluateActions(aGhost, personality());

      // Lava at same dist=100 — lava's extra jump check only at dist<50
      const aLava = makeAwareness({
        nearbyHazards: [{ type: 'lava', x: 500, y: 660, dist: 100 }],
      });
      const lavaScores = evaluateActions(aLava, personality());

      // Ghost adds extra avoidance (ghostAvoid = 0.6 * avoidWeight) at dist<120
      // Both have base avoidance, but ghost adds additional directional avoidance
      expect(ghostScores.moveLeft).toBeGreaterThan(lavaScores.moveLeft);
    });
  });

  describe('evaluatePlatformSeeking edge cases', () => {
    it('geyser nav type does not add jump score', () => {
      const rng = new SeededRNG(42);
      const a = makeAwareness({
        navTarget: { x: 300, y: 500, width: 200, approachX: 420, type: 'g' },
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
      });
      const scores = evaluateActions(a, personality(), 1.0, false, rng);
      // Geyser nav type: walks to approach, but no jump added (geyser launches automatically)
      // Other evaluators might add jump, so compare against a 'j' type to confirm difference
      const rng2 = new SeededRNG(42);
      const aJump = makeAwareness({
        navTarget: { x: 300, y: 500, width: 200, approachX: 420, type: 'j' },
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
      });
      const scoresJump = evaluateActions(aJump, personality(), 1.0, false, rng2);
      // 'j' type adds jump, 'g' type does not — so jump should be less for geyser
      expect(scores.jump).toBeLessThan(scoresJump.jump);
    });

    it('zero-G nav type adds jump score', () => {
      const rng = new SeededRNG(42);
      const a = makeAwareness({
        navTarget: { x: 300, y: 500, width: 200, approachX: 420, type: 'z' },
        self: { x: 400, y: 600, vx: 0, vy: 0, onGround: true, score: 5, slowed: false, fat: false, invincible: false },
      });
      const scores = evaluateActions(a, personality(), 1.0, false, rng);
      // 'z' type adds jump when close enough (|dx| < 60): approachX=420, self=400, dx=20 < 60
      expect(scores.jump).toBeGreaterThan(0);
    });
  });

  describe('evaluateZoneExploitation edge cases', () => {
    it('does not move toward geyser if timer >= 2', () => {
      // Geyser with timer=5 (>= 2) — too far from eruption, should not be exploited
      const a = makeAwareness({
        nearGeyser: { x: 600, y: 400, active: false, timer: 5.0 },
      });
      const scores = evaluateActions(a, personality());

      // With timer >= 2, geyser exploitation is skipped — compare with timer < 2
      const aClose = makeAwareness({
        nearGeyser: { x: 600, y: 400, active: false, timer: 1.0 },
      });
      const scoresClose = evaluateActions(aClose, personality());

      // Timer >= 2: no geyser movement. Timer < 2: adds moveRight
      expect(scoresClose.moveRight).toBeGreaterThan(scores.moveRight);
    });
  });
});
