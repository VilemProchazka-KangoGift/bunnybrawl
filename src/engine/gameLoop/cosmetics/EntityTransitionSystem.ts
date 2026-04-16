import type { MatchState } from '../../types';
import type { CosmeticSystem } from '../types';
import type { PrevEntityState } from './entityTransitions';
import { detectEntityTransitions } from './entityTransitions';

export class EntityTransitionSystem implements CosmeticSystem {
  private state: MatchState;
  private playSound: (name: string) => void;
  private pes: PrevEntityState = { springBounces: [], countdownSec: 4, matchOver: false };

  constructor(state: MatchState, playSound: (name: string) => void) {
    this.state = state;
    this.playSound = playSound;
  }

  init(): void {
    this.pes.springBounces = this.state.springs.map(s => s.bounceTimer);
    this.pes.countdownSec = Math.ceil(this.state.countdown);
    this.pes.matchOver = this.state.matchOver;
  }

  cosmeticUpdate(_dt: number): void {
    detectEntityTransitions(this.state, this.pes, this.playSound);
  }

  cleanup(): void {}
}
