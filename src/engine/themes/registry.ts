import type { ThemeConfig } from './types';
import { MEADOW_THEME } from './meadow';
import { WINTER_LAKE_THEME } from './winterLake';

const THEMES: Map<string, ThemeConfig> = new Map([
  [MEADOW_THEME.id, MEADOW_THEME],
  [WINTER_LAKE_THEME.id, WINTER_LAKE_THEME],
]);

export function getTheme(id: string): ThemeConfig {
  const theme = THEMES.get(id);
  if (!theme) throw new Error(`Unknown theme: ${id}`);
  return theme;
}

export function registerTheme(theme: ThemeConfig): void {
  THEMES.set(theme.id, theme);
}

export function listThemes(): Array<{ id: string; nameKey: string; previewGradient: string }> {
  return Array.from(THEMES.values()).map(t => ({
    id: t.id,
    nameKey: t.nameKey,
    previewGradient: t.previewGradient,
  }));
}
