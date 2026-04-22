import type { MatchState, MatchSettings, Player, PlayerSlot, InputState, Arena, CharacterSlot } from '../../types';
import { isBotSlot } from '../../types';
import { MATCH_COUNTDOWN } from '../../constants';
import type { InputManager } from '../../input';
import type { TouchInputManager } from '../../touchInput';
import type { AIController } from '../../ai';

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

export function getPlayerInput(
  player: Player,
  input: InputManager,
  touchInput: TouchInputManager | null,
  touchSlot: PlayerSlot | null,
  networkInputs: Map<string, InputState> | undefined,
  aiControllers: Map<string, AIController>,
  state: MatchState, arena: Arena, settings: MatchSettings,
): InputState {
  // Network mode: use injected inputs for human players
  if (networkInputs) {
    const netInput = networkInputs.get(player.id);
    if (netInput) {
      if (netInput.jump && player.state === 'airborne') {
        return { left: netInput.left, right: netInput.right, jump: false, down: true };
      }
      return netInput;
    }
  }
  if (isBotSlot(player.id)) {
    const ai = aiControllers.get(player.id);
    if (ai) return ai.getInput(player, state, arena, settings.mods.carrotChase, settings.mods.mirrorArena);
    return { left: false, right: false, jump: false, down: false };
  }
  // Touch input for the local mobile player
  if (touchInput && player.id === touchSlot) {
    return touchInput.getInputForPlayer(player.state === 'airborne');
  }
  return input.getInput(player.id as CharacterSlot);
}
