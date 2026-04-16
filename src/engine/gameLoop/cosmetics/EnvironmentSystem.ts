import type { MatchState } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import type { CosmeticSystem } from '../types';
import { updateWildlife, updateFog, updatePollen, updateShootingStars, updateShockwaves, updateScoreAnimations, updateBouncyWobble, updatePigeonScatterParticles } from './environment';

export class EnvironmentSystem implements CosmeticSystem {
  private state: MatchState;
  private theme: ThemeConfig;

  constructor(state: MatchState, theme: ThemeConfig) {
    this.state = state;
    this.theme = theme;
  }

  init(): void {}

  cosmeticUpdate(dt: number): void {
    updateWildlife(this.state, dt);
    updateFog(this.state, dt);
    updatePollen(this.state, dt);
    updateShootingStars(this.state, this.theme, dt);
    updateShockwaves(this.state, dt);
    updateScoreAnimations(this.state, dt);
    updateBouncyWobble(this.state, dt);
    updatePigeonScatterParticles(this.state, dt);
  }

  cleanup(): void {}
}
