import type { Arena } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

export const MEADOW_ARENA: Arena = {
  id: 'meadow',
  name: 'Meadow',
  themeId: 'meadow',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    // Ground — full width
    { x: 0, y: 660, width: CANVAS_WIDTH, height: 60 },
    // Lower left platform (130px above ground)
    { x: 100, y: 530, width: 180, height: 24 },
    // Lower right platform
    { x: 1000, y: 530, width: 180, height: 24 },
    // Mid left platform (140px above lower)
    { x: 300, y: 410, width: 220, height: 24 },
    // Mid right platform
    { x: 760, y: 410, width: 220, height: 24 },
    // Mid center small
    { x: 540, y: 480, width: 200, height: 24 },
    // Top center platform (130px above mid)
    { x: 490, y: 290, width: 300, height: 24 },
    // High left small (reachable from mid-left)
    { x: 120, y: 340, width: 140, height: 24 },
    // High right small (reachable from mid-right)
    { x: 1020, y: 340, width: 140, height: 24 },
  ],
  spawnPoints: [
    { x: 190, y: 510 },
    { x: 1090, y: 510 },
    { x: 410, y: 390 },
    { x: 870, y: 390 },
    { x: 640, y: 270 },
    { x: 640, y: 640 },
  ],
};

export const WINTER_LAKE_ARENA: Arena = {
  id: 'winter_lake',
  name: 'Winter Lake',
  themeId: 'winter_lake',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    // Ground — full width
    { x: 0, y: 660, width: CANVAS_WIDTH, height: 60 },

    // === SNOWMAN (left, x~250) — 3 stacked steps ===
    // Bottom ball shoulder
    { x: 170, y: 575, width: 150, height: 24 },
    // Mid ball / neck
    { x: 195, y: 505, width: 100, height: 24 },
    // Hat top — tiny perch
    { x: 215, y: 430, width: 70, height: 24 },

    // === IGLOO (right, x~880) — dome with 2 steps ===
    // Lower dome shelf
    { x: 850, y: 575, width: 250, height: 24 },
    // Dome top
    { x: 905, y: 505, width: 140, height: 24 },

    // === CENTER — contested bridge + high ledge ===
    // Frozen bridge connecting snowman and igloo areas
    { x: 470, y: 520, width: 160, height: 24 },
    // King of the hill — high center
    { x: 510, y: 350, width: 200, height: 24 },

    // === CORNERS — small floating ledges ===
    // Far left high
    { x: 30, y: 400, width: 110, height: 24 },
    // Far right high
    { x: 1140, y: 420, width: 110, height: 24 },
  ],
  spawnPoints: [
    { x: 245, y: 555 },
    { x: 975, y: 555 },
    { x: 245, y: 485 },
    { x: 975, y: 485 },
    { x: 550, y: 500 },
    { x: 640, y: 640 },
  ],
};

const ARENA_LIST: Arena[] = [MEADOW_ARENA, WINTER_LAKE_ARENA];

export function getArena(id: string = 'meadow'): Arena {
  const arena = ARENA_LIST.find(a => a.id === id);
  if (!arena) throw new Error(`Unknown arena: ${id}`);
  return arena;
}

export function listArenas(): Array<{ id: string; name: string; themeId: string }> {
  return ARENA_LIST.map(a => ({ id: a.id, name: a.name, themeId: a.themeId }));
}
