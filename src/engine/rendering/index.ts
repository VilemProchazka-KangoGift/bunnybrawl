export { drawCarrot, drawSpringMushroom, drawThorn } from './collectibles';
export { drawWeather, drawParticles, drawGibs, drawGibShape, drawConfetti, drawFireworks, drawWildlife, drawSpringTrail } from './particles';
export { drawHazardZone, drawGhost, drawLavaRock, drawZeroGZone, drawCurrentZone, drawGeyser, drawBouncyPlatformOverlay, drawPigeonFlock, drawScatterFlock, clearHazardCaches } from './hazards';
export { drawDayNightCycle, computeNightIntensity, fireflyPosition, FIREFLY_COUNT } from './effects';
export { drawHUD, drawCountdown, drawConnectionQuality, drawComboPopups, invalidateHudCache, isHudDirty, resetHudState } from './hud';
export { drawPlayer, clearSpriteCache, drawCharacterCore, warmSpriteCacheForCharacters } from './players';
export { drawSurfaceDecals, drawRipples } from './surfaceImpact';

import { clearHazardCaches } from './hazards';
import { clearSpriteCache } from './players';
import { resetHudState } from './hud';

/** Clear all module-level rendering caches. Call on match init/teardown. */
export function clearRenderingCaches(): void {
  clearHazardCaches();
  clearSpriteCache();
  resetHudState();
}

/** Clear only arena-dependent caches (hazards + HUD). Sprite cache is keyed
 *  by helmet-bit so it survives arena swaps — used by `Renderer.setTheme()`
 *  to avoid re-warming characters on every pause-menu arena change. */
export function clearArenaCaches(): void {
  clearHazardCaches();
  resetHudState();
}
