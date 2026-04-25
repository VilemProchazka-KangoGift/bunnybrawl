import type { MatchState, Player, SpringMushroom } from '../../types';
import { SPRING_TRAIL_DURATION } from '../../constants';

export interface PrevEntityState {
  // Keyed by spring object identity, not array index — swapRemove() reuses
  // indices, so an indexed map would track the wrong spring after a swap and
  // either miss a bounce SFX or fire it on the wrong spring.
  springBounces: Map<SpringMushroom, number>;
  countdownSec: number;
  matchOver: boolean;
}

export function detectEntityTransitions(
  state: MatchState,
  pes: PrevEntityState,
  playSound: (name: string) => void,
): void {
  // Springs: bounceTimer 0 → >0. Use a fresh Set of live springs so we can
  // prune entries for springs that were swap-removed since last tick.
  const live = new Set<SpringMushroom>();
  for (const spring of state.springs) {
    live.add(spring);
    const cur = spring.bounceTimer;
    const prev = pes.springBounces.get(spring) ?? 0;
    if (prev <= 0 && cur > 0) {
      playSound('spring');
      let closest: Player | null = null;
      let minDist = 60;
      for (const p of state.players) {
        if (!p.active || p.state === 'splat') continue;
        const dist = Math.sqrt((p.x + p.width / 2 - spring.x) ** 2 + (p.y + p.height - spring.y) ** 2);
        if (dist < minDist) { minDist = dist; closest = p; }
      }
      if (closest) closest.springTrailTimer = SPRING_TRAIL_DURATION;
    }
    pes.springBounces.set(spring, cur);
  }
  // Drop entries for springs no longer in the live set
  for (const key of pes.springBounces.keys()) {
    if (!live.has(key)) pes.springBounces.delete(key);
  }

  // Note: thorn/hazard/ghost/lava rock hit sounds stay in fixedUpdate —
  // entities are removed before cosmeticStep runs. On guest, these are
  // minor effects and acceptable to miss.

  // Countdown
  if (state.countdown > 0) {
    const curSec = Math.ceil(state.countdown);
    if (curSec < pes.countdownSec) playSound('countdown_beep');
    pes.countdownSec = curSec;
  } else if (pes.countdownSec > 0) {
    playSound('countdown_go');
    pes.countdownSec = 0;
  }

  // Match over
  if (state.matchOver && !pes.matchOver) playSound('victory');
  pes.matchOver = state.matchOver;
}
