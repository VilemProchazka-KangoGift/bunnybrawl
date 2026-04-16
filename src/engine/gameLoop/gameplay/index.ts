export { spawnSpring, spawnThorn, updateHazardLifetimes } from './hazards';
export { spawnCarrot } from './carrots';
export { updateLavaRocks, updateGhosts, updateGeyserTimers, updatePigeonFlocks } from './arenaEntities';
export { applyEffectZones, updateZeroGSound } from './effectZones';
export { checkMatchEnd, getPlayerInput } from './match';
export { handleSpringCollision, handleThornCollision, handleHazardZoneCollision, handleGhostCollision, handleLavaRockCollision, handleFallOff } from './playerCollisions';
export type { HazardHitResult } from './playerCollisions';
