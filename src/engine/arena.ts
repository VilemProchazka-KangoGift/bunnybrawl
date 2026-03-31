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
    // Low left — wide ice shelf
    { x: 60, y: 540, width: 240, height: 24 },
    // Low right — wide ice shelf
    { x: 980, y: 540, width: 240, height: 24 },
    // Mid staircase left
    { x: 200, y: 410, width: 160, height: 24 },
    // Mid staircase right
    { x: 920, y: 410, width: 160, height: 24 },
    // Center — large frozen bridge
    { x: 440, y: 480, width: 400, height: 24 },
    // High center — king of the hill
    { x: 520, y: 310, width: 240, height: 24 },
    // Tiny stepping stone left
    { x: 60, y: 340, width: 100, height: 24 },
    // Tiny stepping stone right
    { x: 1120, y: 340, width: 100, height: 24 },
    // Ice cube — left ground (stepping block)
    { x: 380, y: 610, width: 65, height: 24 },
    // Ice cube — right ground
    { x: 835, y: 610, width: 65, height: 24 },
    // Ice cube — floating mid-left
    { x: 430, y: 370, width: 60, height: 24 },
  ],
  spawnPoints: [
    { x: 180, y: 520 },
    { x: 1100, y: 520 },
    { x: 280, y: 390 },
    { x: 1000, y: 390 },
    { x: 640, y: 290 },
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
