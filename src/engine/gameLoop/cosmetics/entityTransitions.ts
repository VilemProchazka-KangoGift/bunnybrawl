import type { MatchState, Player, SpringMushroom } from '../../types';
import { SPRING_TRAIL_DURATION } from '../../constants';
import { TransitionTracker } from '../../transitionTracker';

/** Snapshot fn for the spring-bounce TransitionTracker. */
export const snapshotSpringBounce = (spring: SpringMushroom): number => spring.bounceTimer;

export function detectEntityTransitions(
  state: MatchState,
  prevCountdownSec: number,
  prevMatchOver: boolean,
  springTracker: TransitionTracker<SpringMushroom, number, SpringMushroom>,
  playSound: (name: string) => void,
): { countdownSec: number; matchOver: boolean } {
  // Springs: bounceTimer 0 → >0. The tracker stores prev bounceTimer per
  // spring (object identity, not array index — swapRemove() reuses indices).
  // We collect a Set of live springs and prune stale tracker entries after.
  const live = new Set<SpringMushroom>();
  for (const spring of state.springs) {
    live.add(spring);
    const cur = spring.bounceTimer;
    springTracker.detect(spring, spring, (prevBounce) => {
      if (prevBounce <= 0 && cur > 0) {
        playSound('spring');
        let closest: Player | null = null;
        let minDist = 60;
        for (const p of state.players) {
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
    });
  }
  // Drop tracker entries for springs no longer in the live set
  for (const key of springTracker.keys()) {
    if (!live.has(key)) springTracker.delete(key);
  }

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
  return { countdownSec, matchOver: state.matchOver };
}
