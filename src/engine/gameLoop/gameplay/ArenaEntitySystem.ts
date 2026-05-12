import type { MatchState, Arena, EffectZone } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import type { GameplaySystem } from '../types';
import { CANVAS_WIDTH } from '../../constants';
import { updateLavaRocks, updateGhosts, updateGeyserTimers, updateScatterFlocks } from './arenaEntities';

export class ArenaEntitySystem implements GameplaySystem {
  private state: MatchState;
  private arena: Arena;
  private theme: ThemeConfig;
  private gameRandom: () => number;

  cachedGeyserZones: EffectZone[] = [];
  cachedZeroGZones: EffectZone[] = [];
  geyserIndexMap: Map<EffectZone, number> = new Map();

  constructor(state: MatchState, arena: Arena, theme: ThemeConfig, gameRandom: () => number) {
    this.state = state;
    this.arena = arena;
    this.theme = theme;
    this.gameRandom = gameRandom;
  }

  init(): void {
    // Cache filtered zone arrays (arena-static, avoids per-frame allocations)
    this.cachedGeyserZones = (this.arena.effectZones || []).filter(z => z.type === 'geyser');
    this.cachedZeroGZones = (this.arena.effectZones || []).filter(z => z.type === 'zero_g');
    this.geyserIndexMap = new Map(this.cachedGeyserZones.map((z, i) => [z, i]));

    // Initialize ghosts from theme config
    if (this.theme.ghostConfig) {
      const gc = this.theme.ghostConfig;
      for (let i = 0; i < gc.count; i++) {
        this.state.ghosts.push({
          x: this.gameRandom() * CANVAS_WIDTH,
          y: 300 + this.gameRandom() * 300,
          vx: (this.gameRandom() < 0.5 ? -1 : 1) * gc.speed * (0.7 + this.gameRandom() * 0.6),
          size: gc.size,
          alpha: 0.5 + this.gameRandom() * 0.3,
          wobblePhase: this.gameRandom() * Math.PI * 2,
        });
      }
    }
  }

  fixedUpdate(dt: number): void {
    updateLavaRocks(this.state, this.theme, dt, this.gameRandom);
    updateGhosts(this.state, dt);
    updateGeyserTimers(this.state, this.cachedGeyserZones, dt);
    updateScatterFlocks(this.state, dt);
  }

  getCachedGeyserZones(): EffectZone[] {
    return this.cachedGeyserZones;
  }

  getCachedZeroGZones(): EffectZone[] {
    return this.cachedZeroGZones;
  }

  getGeyserIndexMap(): Map<EffectZone, number> {
    return this.geyserIndexMap;
  }

  cleanup(): void {}
}
