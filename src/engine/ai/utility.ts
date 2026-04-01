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
  evaluatePlatformSeeking(awareness, scores, personality);
  evaluateHazardAvoidance(awareness, scores, personality);
  evaluateCarrotPursuit(awareness, scores, personality);
  evaluateWindCompensation(awareness, scores);
  evaluateEdgeAvoidance(awareness, scores, personality);
  evaluateZoneExploitation(awareness, scores, personality);

  // Roam: always-on baseline so bots keep moving when nothing else is happening
  evaluateRoam(awareness, scores);

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
  const { dx, dy, dist } = a.nearestEnemy;

  // Move toward nearest enemy — walking is the main chase behavior
  if (dx > 20) s.moveRight += weight;
  else if (dx < -20) s.moveLeft += weight;

  // Same Y level (within ~40px) = same platform — just walk, never jump
  const samePlatform = Math.abs(dy) < 40;
  if (samePlatform) return;

  // Only jump if enemy is clearly on a platform above AND we're close horizontally
  if (dy < -50 && a.self.onGround && dist < 150 && Math.abs(dx) < 100) {
    s.jump += weight * 0.3;
  }

  // If enemy is below and we're on a platform, consider dropping
  if (dy > 60 && Math.abs(dx) < 50) {
    s.drop += weight * 0.2;
  }
}

function evaluatePlatformSeeking(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.nearestPlatformAbove || !a.self.onGround) return;
  // Only seek platforms if there's actually a reason (enemy above, or strong preference)
  const hasEnemyAbove = a.nearestEnemy && a.nearestEnemy.dy < -30;
  if (!hasEnemyAbove && p.platformPreference < 1.5) return;

  const weight = 0.3 * p.platformPreference;
  const plat = a.nearestPlatformAbove;

  // Walk toward platform center first
  const platCenter = plat.x + plat.width / 2;
  const dx = platCenter - a.self.x;
  if (dx > 30) s.moveRight += weight;
  else if (dx < -30) s.moveLeft += weight;

  // Only jump when well-positioned under the platform
  if (Math.abs(dx) < plat.width / 2 && plat.dy > -180) {
    s.jump += weight * 0.5;
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
  // Reduce carrot pursuit during active combat (enemy very close)
  if (a.nearestEnemy && a.nearestEnemy.dist < 80) return;

  const weight = 0.5 * p.greediness;
  const dx = a.nearestCarrot.x - a.self.x;

  if (dx > 15) s.moveRight += weight;
  else if (dx < -15) s.moveLeft += weight;

  // Jump toward elevated carrots
  if (a.nearestCarrot.y < a.self.y - 30 && a.self.onGround) {
    s.jump += weight * 0.5;
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
