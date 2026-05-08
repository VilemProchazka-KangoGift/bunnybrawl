import type { MatchState, SpringMushroom } from '../../types';
import type { CosmeticSystem } from '../types';
import { detectEntityTransitions, snapshotSpringBounce } from './entityTransitions';
import { TransitionTracker } from '../../transitionTracker';

export class EntityTransitionSystem implements CosmeticSystem {
  private state: MatchState;
  private playSound: (name: string) => void;
  private prevCountdownSec = 4;
  private prevMatchOver = false;
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
    this.prevCountdownSec = Math.ceil(this.state.countdown);
    this.prevMatchOver = this.state.matchOver;
  }

  cosmeticUpdate(_dt: number): void {
    const next = detectEntityTransitions(
      this.state,
      this.prevCountdownSec,
      this.prevMatchOver,
      this.springTracker,
      this.playSound,
    );
    this.prevCountdownSec = next.countdownSec;
    this.prevMatchOver = next.matchOver;
  }

  cleanup(): void {}

  /** Re-prime baselines against current state — used by reconnect/phase
   *  transitions where running detectEntityTransitions against a stale
   *  prev-state would fire spurious SFX. */
  resetBaseline(): void {
    this.init();
  }
}
