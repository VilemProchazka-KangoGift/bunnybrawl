// ---- Types ----
export type { ArenaPack } from './types';
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
  setArenaNav,
  getArenaNav,
  getArenaDisplayName,
  listArenaPacks,
  toArena,
  toThemeConfig,
} from './registry';

// ---- Initialization ----
export { registerBuiltinArenas } from './builtin';

// ---- Legacy backward-compat ----
export { getArena, listArenas, getTheme, listThemes, mirrorArena } from './legacy';
