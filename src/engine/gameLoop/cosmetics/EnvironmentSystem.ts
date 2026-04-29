import type { MatchState } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import type { CosmeticSystem } from '../types';
import { updateWildlife, updateFog, updatePollen, updateShootingStars, updateShockwaves, updateScoreAnimations, updateBouncyWobble, updatePigeonScatterParticles } from './environment';
import { getSlowDevice } from '../../perfFlags';

export class EnvironmentSystem implements CosmeticSystem {
  private state: MatchState;
  private theme: ThemeConfig;

  constructor(state: MatchState, theme: ThemeConfig) {
    this.state = state;
    this.theme = theme;
  }

  init(): void {}

  cosmeticUpdate(dt: number): void {
    // Decorative atmosphere — frozen on slow-device. Existing entries stay
    // drawn at their last position; renderer doesn't care that they're stale.
    if (!getSlowDevice()) {
      updateWildlife(this.state, dt);
      updateFog(this.state, dt);
      updatePollen(this.state, dt);
      updateShootingStars(this.state, this.theme, dt);
    }
    // Gameplay-relevant feedback (shockwaves, score popups, bouncy jelly,
    // pigeon scatter from stomps) always ticks.
    updateShockwaves(this.state, dt);
    updateScoreAnimations(this.state, dt);
    updateBouncyWobble(this.state, dt);
    updatePigeonScatterParticles(this.state, dt);
  }

  cleanup(): void {}
}
