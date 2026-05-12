import type { Arena, MatchState } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import type { CosmeticSystem } from '../types';
import { updateWildlife, updateBouncyWobble } from './environment';
import { getEntities } from '../../entities/registry';
import type { EntityCosmeticCtx } from '../../entities/types';
import { getSlowDevice } from '../../perfFlags';

export class EnvironmentSystem implements CosmeticSystem {
  private state: MatchState;
  /** Reused cosmetic ctx — entities MUST NOT mutate. */
  private readonly _ctx: EntityCosmeticCtx;

  constructor(state: MatchState, theme: ThemeConfig, arena: Arena) {
    this.state = state;
    this._ctx = { dt: 0, state, arena, theme };
  }

  init(): void {}

  cosmeticUpdate(dt: number): void {
    // Decorative atmosphere is frozen on slow-device; gameplay feedback always ticks.
    // Per-entity slow-device gating lives inside each EntityKind.cosmeticStep.
    if (!getSlowDevice()) {
      updateWildlife(this.state, dt);
    }
    // Entity-registry cosmetic dispatch (fog, pollen, shooting stars,
    // shockwaves, score animations, scatter-flock particles).
    this._ctx.dt = dt;
    for (const e of getEntities()) {
      const step = e.cosmeticStep;
      if (!step) continue;
      step((this.state as unknown as Record<string, unknown[]>)[e.id], this._ctx);
    }
    updateBouncyWobble(this.state, dt);
  }

  cleanup(): void {}
}
