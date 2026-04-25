// src/engine/input/RuleBasedBot.ts
import type { InputState, MatchState, PlayerSlot, BotSlot, Arena } from '../types';
import type { PlayerInput } from './PlayerInput';
import type { AIController } from '../ai';

const NO_INPUT: InputState = { left: false, right: false, jump: false, down: false };

/** PlayerInput backed by an AIController for one bot slot. */
export class RuleBasedBot implements PlayerInput {
  readonly slot: PlayerSlot;
  private readonly controller: AIController;
  private arena: Arena;
  private readonly carrotChase: boolean;
  private readonly mirrorNav: boolean;

  constructor(slot: BotSlot, controller: AIController, arena: Arena, carrotChase: boolean, mirrorNav: boolean) {
    this.slot = slot;
    this.controller = controller;
    this.arena = arena;
    this.carrotChase = carrotChase;
    this.mirrorNav = mirrorNav;
  }

  setArena(arena: Arena): void {
    this.arena = arena;
  }

  getAction(state: Readonly<MatchState>): InputState {
    const self = state.players.find(p => p.id === this.slot);
    if (!self) return { ...NO_INPUT };
    // AIController only reads MatchState — the cast strips Readonly to match its
    // mutable-state signature without actually mutating state.
    return this.controller.getInput(self, state as MatchState, this.arena, this.carrotChase, this.mirrorNav);
  }
}
