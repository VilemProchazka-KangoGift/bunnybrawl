import type { MatchState, SpringMushroom } from '../../types';
import type { CosmeticSystem } from '../types';
import type { PrevEntityState } from './entityTransitions';
import { detectEntityTransitions, snapshotSpringBounce } from './entityTransitions';
import { TransitionTracker } from '../../transitionTracker';

export class EntityTransitionSystem implements CosmeticSystem {
  private state: MatchState;
  private playSound: (name: string) => void;
  private pes: PrevEntityState = { countdownSec: 4, matchOver: false };
  private readonly springTracker: TransitionTracker<SpringMushroom, number, SpringMushroom> =
    new TransitionTracker<SpringMushroom, number, SpringMushroom>(snapshotSpringBounce);

  constructor(state: MatchState, playSound: (name: string) => void) {
    this.state = state;
    this.playSound = playSound;
  }

  init(): void {
    this.springTracker.clear();
    for (const s of this.state.springs) {
      this.springTracker.prime(s, s);
    }
    this.pes.countdownSec = Math.ceil(this.state.countdown);
    this.pes.matchOver = this.state.matchOver;
  }

  cosmeticUpdate(_dt: number): void {
    detectEntityTransitions(this.state, this.pes, this.springTracker, this.playSound);
  }

  cleanup(): void {}

  /** Re-prime baselines against current state — used by reconnect/phase
   *  transitions where running detectEntityTransitions against a stale
   *  prev-state would fire spurious SFX. */
  resetBaseline(): void {
    this.init();
  }
}
