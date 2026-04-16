import type { MatchState, Player } from '../../types';
import { SPRING_TRAIL_DURATION } from '../../constants';

export interface PrevEntityState {
  carrotActives: boolean[];
  springBounces: number[];
  thornHits: boolean[];
  countdownSec: number;
  matchOver: boolean;
}

export function createPrevEntityState(): PrevEntityState {
  return { carrotActives: [], springBounces: [], thornHits: [], countdownSec: 4, matchOver: false };
}

export function detectEntityTransitions(
  state: MatchState,
  pes: PrevEntityState,
  playSound: (name: string) => void,
): void {
  // Carrots: active → inactive = pickup
  // Note: carrot pickup sounds/VFX stay in fixedUpdate — entities are removed
  // before cosmeticStep runs, making transition detection impossible here.
  // On guest, carrot pickup is detected via score change (line 650).

  // Springs: bounceTimer 0 → >0 (springs survive the bounce, so detection works)
  for (let i = 0; i < state.springs.length; i++) {
    const cur = state.springs[i].bounceTimer;
    const prevBounce = pes.springBounces[i] ?? 0;
    if (prevBounce <= 0 && cur > 0) {
      playSound('spring');
      // Set springTrailTimer on nearest player
      const sx = state.springs[i].x;
      const sy = state.springs[i].y;
      let closest: Player | null = null;
      let minDist = 60;
      for (const p of state.players) {
        if (!p.active || p.state === 'splat') continue;
        const dist = Math.sqrt((p.x + p.width / 2 - sx) ** 2 + (p.y + p.height - sy) ** 2);
        if (dist < minDist) { minDist = dist; closest = p; }
      }
      if (closest) closest.springTrailTimer = SPRING_TRAIL_DURATION;
    }
    pes.springBounces[i] = cur;
  }
  pes.springBounces.length = state.springs.length;

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
