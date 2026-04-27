import type { MatchState, MatchSettings, PlayerSlot } from '../../types';
import { MATCH_COUNTDOWN } from '../../constants';

/** Check if match should end. Returns winning player slot or null if no end condition met. */
export function checkMatchEnd(state: MatchState, settings: MatchSettings): PlayerSlot | null {
  for (const player of state.players) {
    if (player.active && player.score >= settings.killLimit) {
      return player.id;
    }
  }
  if (settings.timeLimit > 0 && state.timeElapsed - MATCH_COUNTDOWN >= settings.timeLimit) {
    let winner: PlayerSlot | null = null;
    let maxScore = -1;
    for (const player of state.players) {
      if (player.active && player.score > maxScore) { maxScore = player.score; winner = player.id; }
    }
    return winner;
  }
  return null;
}
