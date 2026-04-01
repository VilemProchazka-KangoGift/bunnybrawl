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

  evaluateStompOpportunity(awareness, scores, personality);
  evaluateThreatEvasion(awareness, scores, personality);
  evaluateChaseTarget(awareness, scores, personality);
  evaluatePlatformSeeking(awareness, scores, personality);
  evaluateHazardAvoidance(awareness, scores, personality);
  evaluateCarrotPursuit(awareness, scores, personality);
  evaluateWindCompensation(awareness, scores);
  evaluateEdgeAvoidance(awareness, scores, personality);
  evaluateZoneExploitation(awareness, scores, personality);

  return scores;
}

function evaluateStompOpportunity(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.stompTarget) return;
  const weight = 1.5 * p.aggressiveness;
  const { dx } = a.stompTarget;

  // Move toward the target horizontally
  if (dx > 10) s.moveRight += weight * 0.8;
  else if (dx < -10) s.moveLeft += weight * 0.8;

  // If above target and close, drop down for the stomp
  if (Math.abs(dx) < 30 && a.self.vy >= 0) {
    s.drop += weight * 0.5;
  }

  // If on ground and target is below, jump first to gain height
  if (a.self.onGround && a.stompTarget.dist < 120) {
    s.jump += weight * 0.6;
  }
}

function evaluateThreatEvasion(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.stompThreat) return;
  const weight = 1.5 * p.cautiousness;

  // Move away from the threat horizontally
  const threatDx = a.stompThreat.x - a.self.x;
  if (threatDx > 0) s.moveLeft += weight;
  else s.moveRight += weight;

  // Jump away if threat is close
  if (a.stompThreat.dist < 80 && a.self.onGround) {
    s.jump += weight * 0.8;
  }
}

function evaluateChaseTarget(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.nearestEnemy) return;
  const weight = 0.6 * p.aggressiveness;
  const { dx, dy, dist } = a.nearestEnemy;

  // Move toward nearest enemy
  if (dx > 20) s.moveRight += weight;
  else if (dx < -20) s.moveLeft += weight;

  // If enemy is above, jump to get closer
  if (dy < -40 && a.self.onGround && dist < 200) {
    s.jump += weight * 0.5;
  }

  // If enemy is below and we're on a platform, consider dropping
  if (dy > 50 && Math.abs(dx) < 60) {
    s.drop += weight * 0.3;
  }
}

function evaluatePlatformSeeking(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.nearestPlatformAbove || !a.self.onGround) return;
  const weight = 0.4 * p.platformPreference;
  const plat = a.nearestPlatformAbove;

  // Move toward platform center
  const platCenter = plat.x + plat.width / 2;
  const dx = platCenter - a.self.x;
  if (dx > 20) s.moveRight += weight;
  else if (dx < -20) s.moveLeft += weight;

  // Jump to reach it if we're roughly under it
  if (Math.abs(dx) < plat.width / 2 + 30 && plat.dy > -200) {
    s.jump += weight * 0.8;
  }
}

function evaluateHazardAvoidance(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.nearestHazard) return;
  const weight = 1.2 * p.cautiousness;
  const hz = a.nearestHazard;

  // Strength scales inversely with distance
  const urgency = Math.max(0, 1 - hz.dist / 150);
  const avoidWeight = weight * urgency;

  const hzDx = hz.x - a.self.x;
  if (hzDx > 0) s.moveLeft += avoidWeight;
  else s.moveRight += avoidWeight;

  // Jump away from ground hazards
  if (hz.type === 'lava' && hz.dist < 80 && a.self.onGround) {
    s.jump += avoidWeight * 0.8;
  }
  // Jump to avoid falling rocks
  if (hz.type === 'lavaRock' && hz.dist < 60) {
    const rockDx = hz.x - a.self.x;
    if (Math.abs(rockDx) < 30) {
      if (rockDx > 0) s.moveLeft += avoidWeight * 0.6;
      else s.moveRight += avoidWeight * 0.6;
    }
  }
  // Jump to avoid ghosts
  if (hz.type === 'ghost' && hz.dist < 100 && a.self.onGround) {
    s.jump += avoidWeight * 0.5;
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
  // In zero-G, jump more to exploit amplified jumps
  if (a.inZeroG && a.self.onGround) {
    s.jump += 0.3 * p.platformPreference;
  }
  // Compensate for current push
  if (a.inCurrent !== 0) {
    const compensation = 0.2;
    if (a.inCurrent > 0) s.moveLeft += compensation;
    else s.moveRight += compensation;
  }
}
