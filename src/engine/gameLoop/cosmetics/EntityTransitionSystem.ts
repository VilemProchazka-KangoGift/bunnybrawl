import type { MatchState, SpringMushroom } from '../../types';
import type { CosmeticSystem } from '../types';
import { detectEntityTransitions, snapshotSpringBounce, awardSpringTrailTo, type EntityTxResult } from './entityTransitions';
import { TransitionTracker } from '../../transitionTracker';

export class EntityTransitionSystem implements CosmeticSystem {
  private state: MatchState;
  private playSound: (name: string) => void;
  private prevCountdownSec = 4;
  private prevMatchOver = false;
  private readonly springTracker: TransitionTracker<SpringMushroom, number, SpringMushroom> =
    new TransitionTracker<SpringMushroom, number, SpringMushroom>(snapshotSpringBounce);
  /** Stable scratches reused across cosmeticUpdate calls so the detect path
   *  doesn't allocate a fresh Set + closure + result object per call. */
  private readonly _liveSprings: Set<SpringMushroom> = new Set();
  private readonly _txResult: EntityTxResult = { countdownSec: 0, matchOver: false };
  private readonly _onSpringTransition = (prevBounce: number, spring: SpringMushroom): void => {
    if (prevBounce <= 0 && spring.bounceTimer > 0) {
      this.playSound('spring');
      awardSpringTrailTo(this.state, spring);
    }
  };

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
      this._liveSprings,
      this._onSpringTransition,
      this._txResult,
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
