/**
 * Built-in entity registration. Mirrors `arenas/builtin.ts` /
 * `characters/builtin.ts` — call `registerBuiltinEntities()` once at
 * module scope from `App.tsx`. Tests that construct `Simulator` directly
 * must also register before use.
 *
 * **Order is observable.** `Simulator.fixedUpdate` iterates registered
 * entities in insertion order, which matches the original explicit call
 * order in `ArenaEntitySystem.fixedUpdate`:
 *   lavaRocks → ghosts → geyserStates → scatterFlocks
 *
 * Determinism (`regression-determinism.test.ts.snap`) is sensitive to RNG
 * consumption order. Re-ordering registrations can invalidate snapshots.
 */

export { lavaRocksEntity } from './lavaRocks';
export { ghostsEntity } from './ghosts';
export { geyserStatesEntity } from './geyserStates';
export { scatterFlocksEntity } from './scatterFlocks';
export { surfaceDecalsEntity } from './surfaceDecals';
export { gibsEntity } from './gibs';
export { confettiEntity } from './confetti';
export { shockwavesEntity } from './shockwaves';
export { ripplesEntity } from './ripples';
export { scoreAnimationsEntity } from './scoreAnimations';
export { comboPopupsEntity } from './comboPopups';
export { fogParticlesEntity } from './fogParticles';
export { pollenParticlesEntity } from './pollenParticles';
export { shootingStarsEntity } from './shootingStars';

export { registerEntity, getEntities, getEntitiesForLayer, getEntityById } from './registry';
export type {
  EntityKind, EntityFixedCtx, EntityCosmeticCtx, EntityRenderCtx,
  EntityRenderLayer, EntityMirrorPolicy, EntityPolicy,
} from './types';

import { registerEntity } from './registry';
import { lavaRocksEntity } from './lavaRocks';
import { ghostsEntity } from './ghosts';
import { geyserStatesEntity } from './geyserStates';
import { scatterFlocksEntity } from './scatterFlocks';
import { surfaceDecalsEntity } from './surfaceDecals';
import { gibsEntity } from './gibs';
import { confettiEntity } from './confetti';
import { shockwavesEntity } from './shockwaves';
import { ripplesEntity } from './ripples';
import { scoreAnimationsEntity } from './scoreAnimations';
import { comboPopupsEntity } from './comboPopups';
import { fogParticlesEntity } from './fogParticles';
import { pollenParticlesEntity } from './pollenParticles';
import { shootingStarsEntity } from './shootingStars';

let _registered = false;

export function registerBuiltinEntities(): void {
  if (_registered) return;
  _registered = true;
  // Tick-order locked entities (fixedUpdate consumes RNG; order ↔ determinism snapshot).
  registerEntity(lavaRocksEntity);
  registerEntity(ghostsEntity);
  registerEntity(geyserStatesEntity);
  registerEntity(scatterFlocksEntity);
  // Visual-only entities — order influences draw stacking within each layer.
  registerEntity(surfaceDecalsEntity);
  registerEntity(gibsEntity);
  registerEntity(confettiEntity);
  registerEntity(shockwavesEntity);
  registerEntity(ripplesEntity);
  registerEntity(scoreAnimationsEntity);
  registerEntity(comboPopupsEntity);
  // Ambient cosmetic entities — half-rate tick + renderer-only state.
  registerEntity(fogParticlesEntity);
  registerEntity(pollenParticlesEntity);
  registerEntity(shootingStarsEntity);
}
