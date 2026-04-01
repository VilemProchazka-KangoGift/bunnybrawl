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

  // When hurt (slowed) or fat, flee from everyone instead of attacking
  if (awareness.self.slowed || awareness.self.fat) {
    evaluateHurtFlee(awareness, scores, personality);
  } else {
    evaluateStompOpportunity(awareness, scores, personality);
    evaluateChaseTarget(awareness, scores, personality);
    evaluateTargetPriority(awareness, scores, personality);
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

  // Suppress jumping in tight spaces — but only when the platform is directly overhead
  // (horizontal overlap), not when it's a side target the bot wants to jump onto.
  // Skip suppression when nav is telling the bot to jump — small obstacles like headstones
  // (dy > -80) shouldn't block a nav-guided jump to a higher platform.
  const navWantsJump = awareness.navTarget && awareness.navTarget.type === 'j';
  if (!navWantsJump && awareness.nearestPlatformAbove && awareness.nearestPlatformAbove.dy > -80) {
    const plat = awareness.nearestPlatformAbove;
    const selfCx = awareness.self.x + 16; // PLAYER_WIDTH/2
    const underPlatform = selfCx > plat.x && selfCx < plat.x + plat.width;
    if (underPlatform) {
      scores.jump = 0;
    }
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

  // When airborne, don't chase toward elevated/below enemies — let landing prediction steer
  if (!a.self.onGround && Math.abs(dy) > 40) return;

  // When on ground with nav, defer to nav for different-level enemies
  if (a.navTarget && a.self.onGround && Math.abs(dy) > 40) return;

  // If enemy is significantly above and there's a climbable platform,
  // DON'T add horizontal chase — let platformSeeking handle the path
  if (dy < -60 && a.nearestPlatformAbove && a.self.onGround) return;

  // Move toward nearest enemy — walking is the main chase behavior
  if (dx > 20) s.moveRight += weight;
  else if (dx < -20) s.moveLeft += weight;

  // Same Y level (within ~40px) = same platform — just walk, never jump
  if (Math.abs(dy) < 40) return;

  // If enemy is below and we're on a platform, consider dropping
  if (dy > 60 && Math.abs(dx) < 50) {
    s.drop += weight * 0.2;
  }
}

/** Hunt fat, slowed, high-score, or streaking opponents — overrides normal chase when a juicy target exists */
function evaluateTargetPriority(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.priorityTarget) return;
  // Scale by aggressiveness — aggressive bots hunt harder
  const weight = 0.8 * p.aggressiveness * Math.min(a.priorityTarget.juiciness, 3);
  const { dx, dy } = a.priorityTarget;

  // When airborne, don't chase elevated/below targets
  if (!a.self.onGround && Math.abs(dy) > 40) return;
  // When on ground with nav, defer to platformSeeking for different-level targets
  if (a.navTarget && a.self.onGround && dy < -60) return;

  // Move toward target
  if (dx > 15) s.moveRight += weight;
  else if (dx < -15) s.moveLeft += weight;

  // Jump toward elevated targets on same horizontal
  if (dy < -40 && a.self.onGround && Math.abs(dx) < 80) {
    s.jump += weight * 0.3;
  }
  // Drop toward targets below
  if (dy > 60 && Math.abs(dx) < 50) {
    s.drop += weight * 0.2;
  }
}

function evaluatePlatformSeeking(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  if (!a.self.onGround) return;

  const hasEnemyAbove = a.nearestEnemy && a.nearestEnemy.dy < -30;
  const roamAbove = a.roamTarget && a.roamTarget.y < a.self.y - 50;
  const climbing = hasEnemyAbove || roamAbove;

  const weight = climbing ? 1.0 : 0.75;

  // Nav-guided pathfinding: use precomputed graph when available
  // Anti-predictability: chaotic bots sometimes ignore nav (fall back to reactive)
  const useNav = a.navTarget && (p.chaosAffinity < 0.5 || Math.random() > p.chaosAffinity * 0.4);

  if (useNav && a.navTarget) {
    const nav = a.navTarget;
    // Add jitter to approach position for variability (+/- 20px)
    const jitteredApproach = nav.approachX + (Math.random() - 0.5) * 40;
    const dx = jitteredApproach - a.self.x;

    if (nav.type === 'j') {
      // Jump edge: walk to approach position, then jump
      if (Math.abs(dx) > 15) {
        if (dx > 0) s.moveRight += weight;
        else s.moveLeft += weight;
      }
      // Jump when roughly in position
      if (Math.abs(dx) < nav.width / 2 + 80) {
        s.jump += weight * 0.75;
      }
    } else if (nav.type === 'd') {
      // Drop edge: walk toward platform edge and drop
      if (Math.abs(dx) > 10) {
        if (dx > 0) s.moveRight += weight;
        else s.moveLeft += weight;
      }
      s.drop += weight * 0.3;
    } else if (nav.type === 'g') {
      // Geyser edge: walk to geyser approach position and ride it up
      if (Math.abs(dx) > 15) {
        if (dx > 0) s.moveRight += weight;
        else s.moveLeft += weight;
      }
      // Don't add jump — geyser launches automatically
    } else if (nav.type === 'z') {
      // Zero-G drift edge: walk to zone edge and jump into zero-G
      if (Math.abs(dx) > 15) {
        if (dx > 0) s.moveRight += weight;
        else s.moveLeft += weight;
      }
      // Jump into the zone — zero-G amplifies the jump
      if (Math.abs(dx) < 60) {
        s.jump += weight * 0.8;
      }
    } else {
      // Walk edge: just walk toward target
      if (Math.abs(dx) > 10) {
        if (dx > 0) s.moveRight += weight;
        else s.moveLeft += weight;
      }
    }
    return;
  }

  // Fallback: reactive nearest-platform-above behavior (easy bots, or when nav has no target)
  if (!a.nearestPlatformAbove) return;
  const plat = a.nearestPlatformAbove;
  const platCenter = plat.x + plat.width / 2;
  const dx = platCenter - a.self.x;
  if (dx > 15) s.moveRight += weight;
  else if (dx < -15) s.moveLeft += weight;

  if (Math.abs(dx) < plat.width / 2 + 80 && plat.dy > -200) {
    s.jump += weight * 0.75;
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

  // If target is above, bias toward climbing (seek higher ground)
  const targetAbove = a.self.y - a.roamTarget.y;
  if (targetAbove > 60 && a.self.onGround && a.nearestPlatformAbove) {
    const climbWeight = 0.5;
    const platCenter = a.nearestPlatformAbove.x + a.nearestPlatformAbove.width / 2;
    const platDx = platCenter - a.self.x;
    if (platDx > 15) s.moveRight += climbWeight;
    else if (platDx < -15) s.moveLeft += climbWeight;
    s.jump += climbWeight * 0.5;
  }

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
  if (a.self.onGround || a.self.vy < 0) return; // only when falling
  if (!a.landingPlatform) return;
  const weight = 0.5;
  const { centerDx } = a.landingPlatform;
  if (centerDx > 20) s.moveRight += weight;
  else if (centerDx < -20) s.moveLeft += weight;
}

/** After respawning (invincible), aggressively chase nearest enemy */
function evaluateInvincibilityAggression(a: AwarenessSnapshot, s: ActionScores, _p: AIPersonality): void {
  if (!a.self.invincible || !a.nearestEnemy) return;
  // When airborne, don't chase elevated enemies
  if (!a.self.onGround && Math.abs(a.nearestEnemy.dy) > 40) return;
  const weight = 1.0; // override personality — everyone is aggressive when invincible
  const { dx, dy } = a.nearestEnemy;
  if (dx > 15) s.moveRight += weight;
  else if (dx < -15) s.moveLeft += weight;
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

/** When stuck inside a geyser zone, steer out — toward nav target if riding intentionally */
function evaluateGeyserEscape(a: AwarenessSnapshot, s: ActionScores): void {
  if (a.geyserEscapeDx === 0) return;

  const airborne = !a.self.onGround;

  // If riding a geyser intentionally (nav target is a geyser edge), steer toward the target platform
  if (airborne && a.navTarget && a.navTarget.type === 'g') {
    const targetCx = a.navTarget.x + a.navTarget.width / 2;
    const dx = targetCx - a.self.x;
    const weight = 2.5;
    if (dx > 15) s.moveRight += weight;
    else if (dx < -15) s.moveLeft += weight;
    return;
  }

  // Default: escape to nearest edge
  const weight = airborne ? 3.0 : 1.5;
  if (a.geyserEscapeDx > 0) s.moveRight += weight;
  else s.moveLeft += weight;
}

function evaluateZoneExploitation(a: AwarenessSnapshot, s: ActionScores, p: AIPersonality): void {
  // Use geysers for height
  if (a.nearGeyser && a.nearGeyser.timer < 2 && !a.nearGeyser.active) {
    const gDx = a.nearGeyser.x - a.self.x;
    const exploitWeight = 0.5;
    if (Math.abs(gDx) > 20) {
      if (gDx > 0) s.moveRight += exploitWeight;
      else s.moveLeft += exploitWeight;
    }
  }
  // In zero-G: steer toward nav target platform if drifting intentionally, else jump to exploit
  if (a.inZeroG && !a.self.onGround && a.navTarget && a.navTarget.type === 'z') {
    const targetCx = a.navTarget.x + a.navTarget.width / 2;
    const dx = targetCx - a.self.x;
    const weight = 1.5;
    if (dx > 15) s.moveRight += weight;
    else if (dx < -15) s.moveLeft += weight;
  } else if (a.inZeroG && a.self.onGround) {
    s.jump += 0.15;
  }
  // Compensate for current push
  if (a.inCurrent !== 0) {
    const compensation = 0.2;
    if (a.inCurrent > 0) s.moveLeft += compensation;
    else s.moveRight += compensation;
  }
}
