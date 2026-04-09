// ---- Types ----
export type { ArenaPack, ArenaNav, NavEdge } from './types';
export type {
  GradientStop, CloudConfig, WeatherConfig, WeatherTypeConfig,
  WildlifeConfig, WildlifeTypeConfig, FogConfig, AmbientParticleConfig,
  DayNightConfig, PhysicsModifiers, AmbientSoundConfig, PeriodicAmbientSound,
} from './types';

// ---- Registry API ----
export {
  registerArena,
  getArenaPack,
  getArenaPackOrThrow,
  getArenaNav,
  getArenaDisplayName,
  listArenaPacks,
  toArena,
  toThemeConfig,
} from './registry';

// ---- Initialization ----
export { registerBuiltinArenas } from './builtin';

// ---- Legacy backward-compat ----
export { getArena, getTheme, mirrorArena } from './legacy';
