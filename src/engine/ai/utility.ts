import type { AwarenessSnapshot, ActionScores, AIPersonality } from './types';

/**
 * Score all possible actions based on awareness and personality.
 * Each evaluator adds positive/negative values to moveLeft, moveRight, jump, drop.
 */
export function evaluateActions(
  awareness: AwarenessSnapshot,
  personality: AIPersonality,
): ActionScores {
  const scores: ActionScores = { moveLeft: 0, moveRight: 0, jump: 0, drop: 0 };

  // When hurt (slowed), flee from everyone instead of attacking
  if (awareness.self.slowed) {
    evaluateHurtFlee(awareness, scores, personality);
  } else {
    evaluateStompOpportunity(awareness, scores, personality);
    evaluateChaseTarget(awareness, scores, personality);
  }
  evaluateThreatEvasion(awareness, scores, personality);
  evaluateAirborneAboveDodge(awareness, scores, personality);
  evaluatePlatformSeeking(awareness, scores, personality);
  evaluateHazardAvoidance(awareness, scores, personality);
  evaluateCarrotPursuit(awareness, scores, personality);
  evaluateWindCompensation(awareness, scores);
  evaluateEdgeAvoidance(awareness, scores, personality);
  evaluateZoneExploitation(awareness, scores, personality);
  evaluateGeyserEscape(awareness, scores);
  evaluateLandingPrediction(awareness, scores);
  evaluateInvincibilityAggression(awareness, scores, personality);
  evaluateClustering(awareness, scores);
  evaluatePanic(awareness, scores, personality);
  evaluateCamping(awareness, scores, personality);

  // Roam: always-on baseline so bots keep moving when nothing else is happening
  evaluateRoam(awareness, scores);

  // Suppress jumping in tight spaces — platform close above means no room to jump
  if (awareness.nearestPlatformAbove && awareness.nearestPlatformAbove.dy > -80) {
    scores.jump = 0;
  }

  return scores;
}

function evaluateHurtFlee(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.nearestEnemy) return;
  // When slowed/hurt, run away from nearest enemy
  const weight = 1.0 * p.cautiousness;
  const { dx } = a.nearestEnemy;
  if (dx > 0) s.moveLeft += weight;
  else s.moveRight += weight;
}

function evaluateStompOpportunity(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.stompTarget) return;
  const weight = 1.2 * p.aggressiveness;
  const { dx } = a.stompTarget;

  // Move toward the target horizontally
  if (dx > 10) s.moveRight += weight * 0.8;
  else if (dx < -10) s.moveLeft += weight * 0.8;

  // If above target and close, drop down for the stomp
  if (Math.abs(dx) < 30 && a.self.vy >= 0) {
    s.drop += weight * 0.4;
  }

  // Only jump if on ground, target is clearly below, and we're close horizontally
  if (a.self.onGround && a.stompTarget.dist < 100 && Math.abs(dx) < 50) {
    s.jump += weight * 0.35;
  }
}

function evaluateThreatEvasion(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.stompThreat) return;
  const weight = 1.2 * p.cautiousness;

  // Move away from the threat horizontally — prefer walking away
  const threatDx = a.stompThreat.x - a.self.x;
  if (threatDx > 0) s.moveLeft += weight;
  else s.moveRight += weight;

  // Only jump if threat is very close and directly above
  if (a.stompThreat.dist < 50 && a.self.onGround) {
    s.jump += weight * 0.4;
  }
}

function evaluateChaseTarget(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.nearestEnemy) return;
  const weight = 0.5 * p.aggressiveness;
  const { dx, dy } = a.nearestEnemy;

  // If enemy is significantly above and there's a climbable platform,
  // DON'T add horizontal chase — let platformSeeking handle the path
  const needsClimbing = dy < -60 && a.nearestPlatformAbove && a.self.onGround;
  if (needsClimbing) {
    // Only hint at dropping if enemy is below
    return;
  }

  // Move toward nearest enemy — walking is the main chase behavior
  if (dx > 20) s.moveRight += weight;
  else if (dx < -20) s.moveLeft += weight;

  // Same Y level (within ~40px) = same platform — just walk, never jump
  const samePlatform = Math.abs(dy) < 40;
  if (samePlatform) return;

  // If enemy is below and we're on a platform, consider dropping
  if (dy > 60 && Math.abs(dx) < 50) {
    s.drop += weight * 0.2;
  }
}

function evaluatePlatformSeeking(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.nearestPlatformAbove || !a.self.onGround) return;
  // Seek platforms if: enemy above, roam target above, or strong preference
  const hasEnemyAbove = a.nearestEnemy && a.nearestEnemy.dy < -30;
  const roamAbove = a.roamTarget && a.roamTarget.y < a.self.y - 50;
  if (!hasEnemyAbove && !roamAbove && p.platformPreference < 1.5) return;

  // Stronger weight when actively climbing toward a target
  const climbing = hasEnemyAbove || roamAbove;
  const weight = climbing ? 0.7 : 0.3 * p.platformPreference;
  const plat = a.nearestPlatformAbove;

  // Walk toward platform — the primary navigation when climbing
  const platCenter = plat.x + plat.width / 2;
  const dx = platCenter - a.self.x;
  if (dx > 15) s.moveRight += weight;
  else if (dx < -15) s.moveLeft += weight;

  // Jump when positioned within reach of the platform
  if (Math.abs(dx) < plat.width / 2 + 80 && plat.dy > -200) {
    s.jump += weight * 0.6;
  }
}

function evaluateHazardAvoidance(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (a.nearbyHazards.length === 0) return;
  const weight = 1.2 * p.cautiousness;

  // Avoid ALL nearby hazards, not just the nearest
  for (const hz of a.nearbyHazards) {
    const urgency = Math.max(0, 1 - hz.dist / 180);
    const avoidWeight = weight * urgency;
    if (avoidWeight < 0.05) continue;

    const hzDx = hz.x - a.self.x;
    if (hzDx > 0) s.moveLeft += avoidWeight;
    else s.moveRight += avoidWeight;

    // Jump away from ground hazards only when very close
    if (hz.type === 'lava' && hz.dist < 50 && a.self.onGround) {
      s.jump += avoidWeight * 0.4;
    }
    // Dodge falling rocks
    if (hz.type === 'lavaRock' && hz.dist < 60 && Math.abs(hzDx) < 30) {
      if (hzDx > 0) s.moveLeft += avoidWeight * 0.6;
      else s.moveRight += avoidWeight * 0.6;
    }
    // Avoid ghosts — stronger weight, wider range
    if (hz.type === 'ghost' && hz.dist < 120) {
      const ghostAvoid = avoidWeight * 0.6;
      if (hzDx > 0) s.moveLeft += ghostAvoid;
      else s.moveRight += ghostAvoid;
    }
  }
}

function evaluateCarrotPursuit(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.nearestCarrot) return;
  // Don't pursue carrots if already fat (slowed)
  if (a.self.fat) return;
  // Skip only if enemy is extremely close (active melee combat)
  if (a.nearestEnemy && a.nearestEnemy.dist < 50) return;

  const weight = 0.7 * p.greediness;
  const dx = a.nearestCarrot.x - a.self.x;

  if (dx > 10) s.moveRight += weight;
  else if (dx < -10) s.moveLeft += weight;

  // Jump toward elevated carrots
  if (a.nearestCarrot.y < a.self.y - 30 && a.self.onGround) {
    s.jump += weight * 0.4;
  }
}

function evaluateWindCompensation(a: AwarenessSnapshot, s: ActionScores): void {
  if (a.windStrength < 30 || a.self.onGround) return;
  // Compensate for wind when airborne
  const compensation = 0.3 * (a.windStrength / 300);
  if (a.windDir > 0) s.moveLeft += compensation;
  else s.moveRight += compensation;
}

function evaluateEdgeAvoidance(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.nearEdge) return;
  const weight = 1.5 * p.cautiousness;
  // Move toward center of current platform
  if (a.nearestPlatformBelow) {
    const platCenter = a.nearestPlatformBelow.x + a.nearestPlatformBelow.width / 2;
    if (platCenter > a.self.x) s.moveRight += weight;
    else s.moveLeft += weight;
  } else {
    // No platform reference — just try to not fall by reversing
    if (a.self.vx > 0) s.moveLeft += weight;
    else s.moveRight += weight;
  }
}

function evaluateRoam(a: AwarenessSnapshot, s: ActionScores): void {
  // Only kick in when other evaluators haven't produced a strong opinion
  const totalAction = Math.abs(s.moveLeft) + Math.abs(s.moveRight);
  if (totalAction > 0.3) return; // something else is already driving movement

  if (!a.roamTarget) return;

  // Walk toward the roam target (nearest carrot or nearest enemy, map-wide)
  const weight = 0.4;
  if (a.roamTarget.dx > 30) s.moveRight += weight;
  else if (a.roamTarget.dx < -30) s.moveLeft += weight;

  // If target is far below and we're on an elevated platform, actively walk toward edge to drop down
  const targetBelow = a.roamTarget.y - a.self.y;
  if (targetBelow > 80 && a.onElevatedPlatform && a.self.onGround) {
    const dropWeight = 0.5;
    if (a.roamTarget.dx > 10) s.moveRight += dropWeight;
    else if (a.roamTarget.dx < -10) s.moveLeft += dropWeight;
    else {
      // Target is directly below — walk either direction to reach an edge
      s.moveRight += dropWeight * 0.5;
    }
  }
}

/** Don't walk under airborne enemies — sidestep with some imprecision */
function evaluateAirborneAboveDodge(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (a.airborneAbove.length === 0 || !a.self.onGround) return;
  const weight = 0.8 * p.cautiousness;
  for (const ab of a.airborneAbove) {
    if (ab.dist > 200) continue;
    const urgency = Math.max(0, 1 - ab.dist / 200);
    // Move away from their X, but with some randomness (not pixel-perfect dodge)
    const dodgeDir = ab.dx > 0 ? -1 : 1;
    const jitter = (Math.random() - 0.5) * 0.3; // imprecise reaction
    if (dodgeDir + jitter > 0) s.moveRight += weight * urgency;
    else s.moveLeft += weight * urgency;
  }
}

/** When airborne and falling, steer toward the nearest landable platform */
function evaluateLandingPrediction(a: AwarenessSnapshot, s: ActionScores): void {
  if (!a.self.isAirborne || a.self.vy < 0) return; // only when falling
  if (!a.landingPlatform) return;
  const weight = 0.5;
  const { centerDx } = a.landingPlatform;
  if (centerDx > 20) s.moveRight += weight;
  else if (centerDx < -20) s.moveLeft += weight;
}

/** After respawning (invincible), aggressively chase nearest enemy */
function evaluateInvincibilityAggression(a: AwarenessSnapshot, s: ActionScores, _p: AIPersonality): void {
  if (!a.self.invincible || !a.nearestEnemy) return;
  const weight = 1.0; // override personality — everyone is aggressive when invincible
  const { dx, dy } = a.nearestEnemy;
  if (dx > 15) s.moveRight += weight;
  else if (dx < -15) s.moveLeft += weight;
  // Jump toward if they're above
  if (dy < -40 && a.self.onGround) {
    s.jump += weight * 0.4;
  }
}

/** If 2+ bots are clustered together, add scatter force */
function evaluateClustering(a: AwarenessSnapshot, s: ActionScores): void {
  if (a.nearbyBotCount < 2) return;
  // Scatter: add random directional force proportional to crowding
  const scatterWeight = 0.3 * Math.min(a.nearbyBotCount, 4);
  if (Math.random() > 0.5) s.moveRight += scatterWeight;
  else s.moveLeft += scatterWeight;
}

/** When losing badly, increase erratic movement */
function evaluatePanic(a: AwarenessSnapshot, s: ActionScores, _p: AIPersonality): void {
  const scoreDiff = a.leaderScore - a.self.score;
  if (scoreDiff < 6) return; // only panic when significantly behind
  const panicLevel = Math.min(1, (scoreDiff - 5) / 10);
  const noise = panicLevel * 0.4;
  s.moveLeft += (Math.random() - 0.5) * noise;
  s.moveRight += (Math.random() - 0.5) * noise;
  s.jump += Math.random() * noise * 0.2;
}

/** Cautious bots on elevated platforms occasionally camp (idle) */
function evaluateCamping(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.onElevatedPlatform || p.cautiousness < 1.3) return;
  // Only camp if no enemy is very close
  if (a.nearestEnemy && a.nearestEnemy.dist < 150) return;
  // Dampen movement — prefer staying put
  const campWeight = 0.3 * (p.cautiousness - 1.0);
  s.moveLeft -= campWeight;
  s.moveRight -= campWeight;
}

/** When stuck inside a geyser zone with no reason to stay, walk out sideways */
function evaluateGeyserEscape(a: AwarenessSnapshot, s: ActionScores): void {
  if (a.geyserEscapeDx === 0) return;
  // Only escape if there's nothing useful up here (no enemies, no carrots nearby)
  if (a.nearestEnemy && a.nearestEnemy.dist < 150) return;
  if (a.nearestCarrot && a.nearestCarrot.dist < 100) return;

  const weight = 1.0; // strong — being stuck in a geyser is bad
  if (a.geyserEscapeDx > 0) s.moveRight += weight;
  else s.moveLeft += weight;
}

function evaluateZoneExploitation(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  // Use geysers for height
  if (a.nearGeyser && a.nearGeyser.timer < 2 && !a.nearGeyser.active) {
    const gDx = a.nearGeyser.x - a.self.x;
    const exploitWeight = 0.5 * p.platformPreference;
    if (Math.abs(gDx) > 20) {
      if (gDx > 0) s.moveRight += exploitWeight;
      else s.moveLeft += exploitWeight;
    }
  }
  // In zero-G, occasionally jump to exploit amplified jumps
  if (a.inZeroG && a.self.onGround) {
    s.jump += 0.15 * p.platformPreference;
  }
  // Compensate for current push
  if (a.inCurrent !== 0) {
    const compensation = 0.2;
    if (a.inCurrent > 0) s.moveLeft += compensation;
    else s.moveRight += compensation;
  }
}
