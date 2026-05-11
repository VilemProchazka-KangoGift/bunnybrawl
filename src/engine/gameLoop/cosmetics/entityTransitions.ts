import type { MatchState, Player, SpringMushroom } from '../../types';
import { SPRING_TRAIL_DURATION } from '../../constants';
import { TransitionTracker } from '../../transitionTracker';

/** Snapshot fn for the spring-bounce TransitionTracker. */
export const snapshotSpringBounce = (spring: SpringMushroom): number => spring.bounceTimer;

export interface EntityTxResult { countdownSec: number; matchOver: boolean }

/** Spring-bounce side effect on a player. Called from the detect callback. */
function awardSpringTrailTo(state: MatchState, spring: SpringMushroom): void {
  let closest: Player | null = null;
  let minDist = 60;
  const players = state.players;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p.active || p.state === 'splat') continue;
    const dist = Math.sqrt((p.x + p.width / 2 - spring.x) ** 2 + (p.y + p.height - spring.y) ** 2);
    if (dist < minDist) { minDist = dist; closest = p; }
  }
  if (closest) {
    closest.springTrailTimer = SPRING_TRAIL_DURATION;
    // Anchor trail at the spring (stable across frames). Mirrors host-side
    // setter in handleSpringCollision so guest peers also render the trail
    // from a fixed launch point even though springLaunchX/Y aren't snapshotted.
    closest.springLaunchX = spring.x;
    closest.springLaunchY = spring.y;
  }
}

export function detectEntityTransitions(
  state: MatchState,
  prevCountdownSec: number,
  prevMatchOver: boolean,
  springTracker: TransitionTracker<SpringMushroom, number, SpringMushroom>,
  playSound: (name: string) => void,
  liveSpringsScratch: Set<SpringMushroom>,
  onSpringTransition: (prev: number, spring: SpringMushroom) => void,
  result: EntityTxResult,
): EntityTxResult {
  // Springs: bounceTimer 0 → >0. The tracker stores prev bounceTimer per
  // spring (object identity, not array index — swapRemove() reuses indices).
  // The live set scratch is reused; the onSpringTransition callback is a
  // stable class-field arrow on the calling system so we don't allocate
  // either per call.
  liveSpringsScratch.clear();
  for (const spring of state.springs) {
    liveSpringsScratch.add(spring);
    springTracker.detect(spring, spring, onSpringTransition);
  }
  // Drop tracker entries for springs no longer in the live set
  for (const key of springTracker.keys()) {
    if (!liveSpringsScratch.has(key)) springTracker.delete(key);
  }

  // Touch the helper so module-imports detect this file's narrow public surface.
  void awardSpringTrailTo;

  // Note: thorn/hazard/ghost/lava rock hit sounds stay in fixedUpdate —
  // entities are removed before cosmeticStep runs. On guest, these are
  // minor effects and acceptable to miss.

  // Countdown
  let countdownSec = prevCountdownSec;
  if (state.countdown > 0) {
    const curSec = Math.ceil(state.countdown);
    if (curSec < countdownSec) playSound('countdown_beep');
    countdownSec = curSec;
  } else if (countdownSec > 0) {
    playSound('countdown_go');
    countdownSec = 0;
  }

  // Match over
  if (state.matchOver && !prevMatchOver) playSound('victory');

  result.countdownSec = countdownSec;
  result.matchOver = state.matchOver;
  return result;
}

/** Exposed so EntityTransitionSystem can build its class-field arrow without
 *  duplicating the side-effect logic. */
export { awardSpringTrailTo };
