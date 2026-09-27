import type { MatchState, MatchSettings, PlayerSlot } from '../../types';
import { MATCH_COUNTDOWN } from '../../constants';

/** Outcome of an ended match. `winner: null` means a draw (tied lead). */
export interface MatchEndResult {
  winner: PlayerSlot | null;
}

/** Check if the match should end. Returns the end result, or `null` when NO end
 *  condition is met yet. Note the two distinct nulls: a `null` return = "keep
 *  playing", whereas a `{ winner: null }` return = "match ended in a draw". */
export function checkMatchEnd(state: MatchState, settings: MatchSettings): MatchEndResult | null {
  for (const player of state.players) {
    if (player.active && !player.disconnected && player.score >= settings.killLimit) {
      return { winner: player.id };
    }
  }
  if (settings.timeLimit > 0 && state.timeElapsed - MATCH_COUNTDOWN >= settings.timeLimit) {
    // Time's up — the match ends. Highest score wins; an exact tie for the lead
    // is a draw (winner null). Disconnected players are excluded — a corpse
    // can't win on the clock. If somehow no player is eligible, this isn't an
    // end via this path (the all-disconnected guard in MatchSystem handles it).
    let winner: PlayerSlot | null = null;
    let maxScore = -1;
    let tied = false;
    let anyEligible = false;
    for (const player of state.players) {
      if (!player.active || player.disconnected) continue;
      anyEligible = true;
      if (player.score > maxScore) { maxScore = player.score; winner = player.id; tied = false; }
      else if (player.score === maxScore) { tied = true; }
    }
    if (!anyEligible) return null;
    return { winner: tied ? null : winner };
  }
  return null;
}
