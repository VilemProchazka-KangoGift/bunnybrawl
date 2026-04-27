// Shared lobby constants and layout. The arena layout itself lives in the
// lobby arena pack (`src/engine/arenas/packs/lobby.ts`); these constants are
// kept here because both the pack and `LobbyGame` consume them.

import type { CharacterSlot } from './types';
import { CANVAS_WIDTH } from './constants';

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
