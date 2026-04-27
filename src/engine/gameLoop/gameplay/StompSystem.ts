import type { MatchState, Arena, MatchSettings, PlayerSlot } from '../../types';
import type { GameplaySystem } from '../types';
import type { SeededRNG } from '../../net/prng';
import { processStompsAndCollisions } from './stomps';

export class StompSystem implements GameplaySystem {
  private state: MatchState;
  private arena: Arena;
  private settings: MatchSettings;
  private resimulatingGetter: () => boolean;
  private rngGetter: () => SeededRNG | undefined;
  private onStompHaptic: (slot: PlayerSlot) => void;

  constructor(
    state: MatchState,
    arena: Arena,
    settings: MatchSettings,
    resimulatingGetter: () => boolean,
    rngGetter: () => SeededRNG | undefined,
    onStompHaptic: (slot: PlayerSlot) => void,
  ) {
    this.state = state;
    this.arena = arena;
    this.settings = settings;
    this.resimulatingGetter = resimulatingGetter;
    this.rngGetter = rngGetter;
    this.onStompHaptic = onStompHaptic;
  }

  init(): void {}

  fixedUpdate(dt: number): void {
    processStompsAndCollisions(
      this.state,
      this.arena,
      this.settings,
      dt,
      this.resimulatingGetter(),
      this.rngGetter(),
      this.onStompHaptic,
    );
  }

  cleanup(): void {}
}
