// Barrel for the hazards rendering module. Public API and cache lifecycle live
// here; per-category files (lava.ts, zones.ts, creatures.ts) own their own
// module-local caches and expose `clearXCaches()` helpers that this barrel
// aggregates into the single public `clearHazardCaches()`.
//
// Scaffold step: while extraction is in progress, this barrel simply
// re-exports the legacy `../hazards.ts` surface unchanged. Later commits
// move functions out of `hazards.ts` and into the category files; consumers
// continue to import from `'../rendering/hazards'` (which now resolves to
// this directory) without code change.
export {
  drawHazardZone,
  drawGhost,
  drawLavaRock,
  drawZeroGZone,
  drawCurrentZone,
  drawGeyser,
  drawBouncyPlatformOverlay,
  drawPigeonFlock,
  drawScatterFlock,
  pickScatterColor,
  clearHazardCaches,
} from '../hazards';
