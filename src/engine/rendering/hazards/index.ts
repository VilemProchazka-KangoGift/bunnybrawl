// Barrel for the hazards rendering module. Re-exports the full public API
// from the per-category files (lava, zones, creatures) and aggregates each
// category's cache-clearing helper into the single public
// `clearHazardCaches()`.
//
// Consumers continue to import from `'../rendering/hazards'`; TypeScript
// resolves that to this directory's index.
import { clearLavaCaches } from './lava';
import { clearZoneCaches } from './zones';
import { clearCreatureCaches } from './creatures';

export { drawLavaRock } from './lava';
export {
  drawHazardZone,
  drawZeroGZone,
  drawCurrentZone,
  drawGeyser,
  drawBouncyPlatformOverlay,
} from './zones';
export {
  drawGhost,
  drawPigeonFlock,
  drawScatterFlock,
  pickScatterColor,
} from './creatures';

/** Clear every module-local cache owned by the hazards rendering module. */
export function clearHazardCaches(): void {
  clearLavaCaches();
  clearZoneCaches();
  clearCreatureCaches();
}
