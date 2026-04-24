export { drawCarrot, drawSpringMushroom, drawThorn } from './collectibles';
export { drawWeather, drawParticles, drawGibs, drawGibShape, drawConfetti, drawFireworks, drawWildlife, drawSpringTrail } from './particles';
export { drawHazardZone, drawGhost, drawLavaRock, drawZeroGZone, drawCurrentZone, drawGeyser, drawBouncyPlatformOverlay, drawPigeonFlock, clearHazardCaches } from './hazards';
export { drawDayNightCycle } from './effects';
export { drawHUD, drawCountdown, drawConnectionQuality, invalidateHudCache, isHudDirty, resetHudState } from './hud';
export { drawPlayer, clearSpriteCache, drawCharacterCore, warmSpriteCacheForCharacters } from './players';

import { clearHazardCaches } from './hazards';
import { clearSpriteCache } from './players';
import { resetHudState } from './hud';

/** Clear all module-level rendering caches. Call on match init/teardown. */
export function clearRenderingCaches(): void {
  clearHazardCaches();
  clearSpriteCache();
  resetHudState();
}
