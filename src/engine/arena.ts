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
    // Lower left platform
    { x: 100, y: 520, width: 160, height: 24 },
    // Lower right platform
    { x: 1020, y: 520, width: 160, height: 24 },
    // Mid left platform
    { x: 280, y: 400, width: 200, height: 24 },
    // Mid right platform
    { x: 800, y: 400, width: 200, height: 24 },
    // Top center platform
    { x: 540, y: 280, width: 200, height: 24 },
    // High left small
    { x: 150, y: 300, width: 100, height: 24 },
    // High right small
    { x: 1030, y: 300, width: 100, height: 24 },
  ],
  spawnPoints: [
    { x: 200, y: 500 },
    { x: 1080, y: 500 },
    { x: 380, y: 380 },
    { x: 900, y: 380 },
    { x: 640, y: 260 },
    { x: 640, y: 640 },
  ],
};

export function getArena(): Arena {
  return MEADOW_ARENA;
}
