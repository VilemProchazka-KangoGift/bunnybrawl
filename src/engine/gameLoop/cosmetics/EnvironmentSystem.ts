import type { MatchState } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import type { CosmeticSystem } from '../types';
import { updateWildlife, updateFog, updatePollen, updateShootingStars, updateShockwaves, updateScoreAnimations, updateBouncyWobble, updatePigeonScatterParticles, updateScatterFlockParticles } from './environment';
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
    // Decorative atmosphere is frozen on slow-device; gameplay feedback always ticks.
    if (!getSlowDevice()) {
      updateWildlife(this.state, dt);
      updateFog(this.state, dt);
      updatePollen(this.state, dt);
      updateShootingStars(this.state, this.theme, dt);
    }
    updateShockwaves(this.state, dt);
    updateScoreAnimations(this.state, dt);
    updateBouncyWobble(this.state, dt);
    updatePigeonScatterParticles(this.state, dt);
    updateScatterFlockParticles(this.state, dt);
  }

  cleanup(): void {}
}
