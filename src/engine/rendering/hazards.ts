// Legacy shim — original 879-line hazards.ts has been split into the
// `hazards/` directory. Public API is preserved by re-exporting from each
// category file; `clearHazardCaches()` aggregates each category's
// cache-clearing helper.
//
// Kept temporarily so the in-progress refactor commit graph stays atomic.
// The next commit deletes this file, after which TypeScript module
// resolution falls through to `hazards/index.ts`.
import { clearLavaCaches } from './hazards/lava';
import { clearZoneCaches } from './hazards/zones';
import { clearCreatureCaches } from './hazards/creatures';

export { drawLavaRock } from './hazards/lava';
export {
  drawHazardZone,
  drawZeroGZone,
  drawCurrentZone,
  drawGeyser,
  drawBouncyPlatformOverlay,
} from './hazards/zones';
export {
  drawGhost,
  drawPigeonFlock,
  drawScatterFlock,
  pickScatterColor,
} from './hazards/creatures';

export function clearHazardCaches(): void {
  clearLavaCaches();
  clearZoneCaches();
  clearCreatureCaches();
}
