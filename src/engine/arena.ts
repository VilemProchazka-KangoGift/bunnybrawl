import type { Arena } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

export const MEADOW_ARENA: Arena = {
  name: 'Meadow',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: '#87CEEB', // sky blue
  groundColor: '#4a8c3f',
  platformColor: '#8B6914',
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

export function getArena(): Arena {
  return MEADOW_ARENA;
}
