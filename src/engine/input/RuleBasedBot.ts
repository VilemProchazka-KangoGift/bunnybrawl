// src/engine/input/RuleBasedBot.ts
import type { InputState, MatchState, PlayerSlot, BotSlot, Arena } from '../types';
import type { PlayerInput, PlayerInputContext } from './PlayerInput';
import type { AIController } from '../ai';
import { normalizeCharacterScale } from '../characterScale';

const NO_INPUT: InputState = { left: false, right: false, jump: false, down: false };

/** PlayerInput backed by an AIController for one bot slot. */
export class RuleBasedBot implements PlayerInput {
  readonly slot: PlayerSlot;
  private readonly controller: AIController;
  private arena: Arena;
  private readonly carrotChase: boolean;
  private readonly mirrorNav: boolean;
  private movementScale: number;

  constructor(
    slot: BotSlot, controller: AIController, arena: Arena,
    carrotChase: boolean, mirrorNav: boolean, movementScale = 1,
  ) {
    this.slot = slot;
    this.controller = controller;
    this.arena = arena;
    this.carrotChase = carrotChase;
    this.mirrorNav = mirrorNav;
    this.movementScale = normalizeCharacterScale(movementScale);
  }

  setArena(arena: Arena): void {
    this.arena = arena;
  }

  setMovementScale(value?: number): void {
    this.movementScale = normalizeCharacterScale(value);
  }

  getAction(state: Readonly<MatchState>, _ctx?: PlayerInputContext): InputState {
    // Indexed loop instead of Array.find — avoids a closure alloc per bot per tick.
    let self: Readonly<MatchState>['players'][number] | undefined;
    const players = state.players;
    for (let i = 0; i < players.length; i++) {
      if (players[i].id === this.slot) { self = players[i]; break; }
    }
    // NO_INPUT is treated read-only by consumers (physics.applyInput only reads
    // input; Simulator uses a shared _NEUTRAL_INPUT const on the same path).
    if (!self) return NO_INPUT;
    // AIController only reads MatchState — the cast strips Readonly to match its
    // mutable-state signature without actually mutating state.
    return this.controller.getInput(
      self, state as MatchState, this.arena, this.carrotChase, this.mirrorNav, this.movementScale,
    );
  }
}
