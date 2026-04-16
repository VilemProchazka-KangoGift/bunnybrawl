import type { MatchState, Arena, MatchSettings } from '../../types';
import type { GameplaySystem } from '../types';
import type { SeededRNG } from '../../net/prng';
import { processStompsAndCollisions } from './stomps';

export class StompSystem implements GameplaySystem {
  private state: MatchState;
  private arena: Arena;
  private settings: MatchSettings;
  private resimulatingGetter: () => boolean;
  private rngGetter: () => SeededRNG | undefined;

  constructor(
    state: MatchState,
    arena: Arena,
    settings: MatchSettings,
    resimulatingGetter: () => boolean,
    rngGetter: () => SeededRNG | undefined,
  ) {
    this.state = state;
    this.arena = arena;
    this.settings = settings;
    this.resimulatingGetter = resimulatingGetter;
    this.rngGetter = rngGetter;
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
    );
  }

  cleanup(): void {}
}
