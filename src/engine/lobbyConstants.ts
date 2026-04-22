// Shared lobby constants, layout, and engine-compat stubs.

import type { Arena, CharacterSlot } from './types';
import type { ThemeConfig } from './themes/types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './constants';

export const SLOTS: CharacterSlot[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
export const READY_ZONE_X = CANVAS_WIDTH * 0.72;
export const LOBBY_DAY_CYCLE = 90;
export const COUNTDOWN_SECONDS = 5;
export const GROUND_Y = 560;
export const LOBBY_GRAVITY = 600;
export const LOBBY_SPEED = 200;
export const LOBBY_JUMP = -400;

// Wall obstacle at ~2/3 of screen — forces players to jump to reach the ready zone
export const WALL_X = CANVAS_WIDTH * 0.58;
export const WALL_WIDTH = 24;
export const WALL_HEIGHT = 120;
export const WALL_Y = GROUND_Y - WALL_HEIGHT;

export const BOT_PAUSE_CHANCE = [0.003, 0.002, 0.004, 0.001, 0.003];

export const FLOWER_COLORS = ['#FF6B8A', '#FFD700', '#FF69B4', '#DDA0DD', '#87CEEB', '#FFA07A'];
export const FLOWER_POSITIONS = [100, 190, 260, 340, 430, 520, 580, 670];

// Synthetic arena used by engine physics (collidePlatforms needs a Platform[]).
// Ground spans full width; wall obstacle matches the visual WALL_X/WALL_Y/WALL_WIDTH/WALL_HEIGHT.
export const LOBBY_ARENA: Arena = {
  id: 'lobby',
  name: 'Lobby',
  themeId: 'lobby',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: [
    { x: 0, y: GROUND_Y, width: CANVAS_WIDTH, height: CANVAS_HEIGHT - GROUND_Y },
    { x: WALL_X, y: WALL_Y, width: WALL_WIDTH, height: WALL_HEIGHT },
  ],
  spawnPoints: [],
  allowFallOff: false,
};

// Minimal theme stub for drawPlayer — it only reads theme.bubbleHelmet.
// Other fields set to satisfy the type but never consulted in the lobby render path.
export const LOBBY_THEME = { bubbleHelmet: false } as unknown as ThemeConfig;
