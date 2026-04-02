import type { ThemeConfig } from './types';
import { MEADOW_THEME } from './meadow';
import { WINTER_LAKE_THEME } from './winterLake';
import { VOLCANO_THEME } from './volcano';
import { CASTLE_THEME } from './castle';
import { CANDY_LAND_THEME } from './candyLand';
import { TREETOPS_THEME } from './treetops';
import { UNDERWATER_THEME } from './underwater';
import { HAUNTED_GRAVEYARD_THEME } from './hauntedGraveyard';
import { ROOFTOPS_THEME } from './rooftops';
import { SPACE_STATION_THEME } from './spaceStation';
import { WATERFALL_THEME } from './waterfall';

const THEMES: Map<string, ThemeConfig> = new Map([
  [MEADOW_THEME.id, MEADOW_THEME],
  [WINTER_LAKE_THEME.id, WINTER_LAKE_THEME],
  [VOLCANO_THEME.id, VOLCANO_THEME],
  [CASTLE_THEME.id, CASTLE_THEME],
  [CANDY_LAND_THEME.id, CANDY_LAND_THEME],
  [TREETOPS_THEME.id, TREETOPS_THEME],
  [UNDERWATER_THEME.id, UNDERWATER_THEME],
  [HAUNTED_GRAVEYARD_THEME.id, HAUNTED_GRAVEYARD_THEME],
  [ROOFTOPS_THEME.id, ROOFTOPS_THEME],
  [SPACE_STATION_THEME.id, SPACE_STATION_THEME],
  [WATERFALL_THEME.id, WATERFALL_THEME],
]);

export function getTheme(id: string): ThemeConfig {
  const theme = THEMES.get(id);
  if (!theme) throw new Error(`Unknown theme: ${id}`);
  return theme;
}

export function registerTheme(theme: ThemeConfig): void {
  THEMES.set(theme.id, theme);
}

export function listThemes(): Array<{ id: string; nameKey: string; previewGradient: string; previewIcon: string }> {
  return Array.from(THEMES.values()).map(t => ({
    id: t.id,
    nameKey: t.nameKey,
    previewGradient: t.previewGradient,
    previewIcon: t.previewIcon,
  }));
}
