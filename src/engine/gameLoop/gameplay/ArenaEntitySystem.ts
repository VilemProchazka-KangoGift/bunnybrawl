import type { MatchState, Arena, EffectZone } from '../../types';
import type { ThemeConfig } from '../../themes/types';
import type { GameplaySystem } from '../types';

/**
 * Caches arena effectZone arrays consumed by EffectZoneSystem +
 * ParticleSystem. Entity ticks (lava rocks, ghosts, geysers, scatter
 * flocks) live in `src/engine/entities/` and dispatch through the entity
 * registry — see `Simulator.fixedUpdate`. Ghost spawn moved to
 * `ghostsEntity.init`; geyser-timer init moved to `geyserStatesEntity.init`.
 */
export class ArenaEntitySystem implements GameplaySystem {
  private arena: Arena;

  cachedGeyserZones: EffectZone[] = [];
  cachedZeroGZones: EffectZone[] = [];
  geyserIndexMap: Map<EffectZone, number> = new Map();

  constructor(_state: MatchState, arena: Arena, _theme: ThemeConfig, _gameRandom: () => number) {
    this.arena = arena;
  }

  init(): void {
    // Cache filtered zone arrays (arena-static, avoids per-frame allocations)
    this.cachedGeyserZones = (this.arena.effectZones || []).filter(z => z.type === 'geyser');
    this.cachedZeroGZones = (this.arena.effectZones || []).filter(z => z.type === 'zero_g');
    this.geyserIndexMap = new Map(this.cachedGeyserZones.map((z, i) => [z, i]));
  }

  fixedUpdate(_dt: number): void {
    // Entity ticks dispatched via `getEntities()` in `Simulator.fixedUpdate`.
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
