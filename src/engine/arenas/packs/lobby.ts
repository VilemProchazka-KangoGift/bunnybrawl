import { BUILTIN_ARENA_PREVIEWS } from '../previewCatalog';
import type { ArenaPack } from '../types';
import type { Arena, Platform, Ctx2D } from '../../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../constants';
import { applyIsoInsets } from '../../themes/drawPrimitives';
import {
  GROUND_Y, WALL_X, WALL_Y, WALL_WIDTH, WALL_HEIGHT, LOBBY_DAY_CYCLE,
  FLOWER_COLORS,
} from '../../lobbyConstants';
import {
  drawMeadowBush, drawMeadowFlower, drawMeadowMushroom, drawMeadowPlatform,
} from './meadowSelectedArt';
import { drawPaintedMeadowValley, drawMeadowCloud, MEADOW_CLOUDS } from './meadowBackdrop';

export const lobby: ArenaPack = {
  // ---- Identity, preview, and translations ----
  ...BUILTIN_ARENA_PREVIEWS.lobby,

  // ---- Layout ----
  defaultSurface: 'grass',
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  platforms: applyIsoInsets(
    [
      { x: 0, y: GROUND_Y, width: CANVAS_WIDTH, height: CANVAS_HEIGHT - GROUND_Y },
      { x: WALL_X, y: WALL_Y, width: WALL_WIDTH, height: WALL_HEIGHT, style: 'wall' },
    ] as Platform[],
    p => p.style !== 'wall',
  ),
  spawnPoints: [],
  allowFallOff: false,

  // ---- Visual config ----
  // Keep the painted valley soft behind the lobby's tutorial and ready cues.
  sky: {
    gradient: [
      { offset: 0, color: '#316DAA' },
      { offset: 0.6, color: '#92C6E0' },
      { offset: 1, color: '#E5EBD5' },
    ],
  },

  hills: [],

  ground: {
    surfaceColor: '#6BBF59',
  },

  // Match Meadow's slow, elongated clouds and keep them high above the play area.
  clouds: {
    count: MEADOW_CLOUDS.length,
    color: 'rgba(255, 255, 248, 0.78)',
    minSize: 50,
    maxSize: 145,
    minSpeed: 6,
    maxSpeed: 12,
    yRange: [40, 100],
    initialClouds: MEADOW_CLOUDS,
    draw: drawMeadowCloud,
  },

  weather: {
    particleCount: 0,
    types: [],
  },

  wildlife: {
    count: 6,
    types: [
      { type: 'butterfly', weight: 0.7, colors: ['#FFD700', '#FF69B4', '#87CEEB', '#DDA0DD', '#FFA07A'], speedRange: [15, 30], yRange: [0.2, 0.8] },
      { type: 'bird', weight: 0.3, colors: ['#333', '#555'], speedRange: [40, 80], yRange: [0.05, 0.25] },
    ],
  },

  fog: {
    count: 0,
    baseY: GROUND_Y,
    yVariance: 0,
    speedRange: [0, 0],
    alphaRange: [0, 0],
    color: '#FFFFFF',
    sizeX: 0,
    sizeY: 0,
  },

  ambientParticles: {
    count: 0,
    sizeRange: [1, 1],
    vxRange: [0, 0],
    vyRange: [0, 0],
    alphaRange: [0, 0],
    colors: ['#FFFFFF'],
  },

  dayNight: {
    enabled: true,
    cycleDuration: LOBBY_DAY_CYCLE,
    maxNightAlpha: 0.55,
    showFireflies: true,
    showShootingStars: true,
  },

  // ---- Custom draw functions ----
  drawFarBackground: (ctx: Ctx2D, _arena: Arena) => drawPaintedMeadowValley(ctx),

  drawBackgroundNature: (ctx: Ctx2D, _arena: Arena) => {
    // Leave the jump wall, tutorial, and ready zone clear. These bushes are
    // spaced along the approach so they never overlap one another.
    drawMeadowBush(ctx, 145, GROUND_Y, 38, false);
    drawMeadowBush(ctx, 410, GROUND_Y, 34, false);
    drawMeadowFlower(ctx, 265, GROUND_Y, FLOWER_COLORS[1], 17);
    drawMeadowFlower(ctx, 575, GROUND_Y, FLOWER_COLORS[3], 18);
    drawMeadowMushroom(ctx, 305, GROUND_Y);
  },

  drawForegroundNature: () => {},

  drawPlatform: (ctx: Ctx2D, platform: Platform) => {
    // The grass floor and tutorial wall share Meadow's storybook earth and cap.
    // The wall keeps its dedicated, unchanged collision rectangle.
    if (platform.style === 'wall') drawLobbyLog(ctx, platform);
    else drawMeadowPlatform(ctx, platform, true);
  },
};



/** Irregular bark, a sawn end and broad value planes, cached with terrain. */
function drawLobbyLog(c: Ctx2D, p: Platform): void {
  const { x, y, width: w, height: h } = p;
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = 2.5; c.strokeStyle = '#334937';
  c.fillStyle = '#946342';
  c.beginPath(); c.moveTo(x + 6, y + 2); c.lineTo(x + w - 26, y);
  c.bezierCurveTo(x + w - 7, y - 1, x + w - 3, y + 15, x + w - 3, y + h / 2);
  c.bezierCurveTo(x + w - 2, y + h - 12, x + w - 15, y + h + 1, x + w - 28, y + h);
  c.lineTo(x + 8, y + h - 2); c.lineTo(x + 2, y + h - 11); c.lineTo(x + 5, y + h * .64);
  c.lineTo(x + 1, y + h * .44); c.lineTo(x + 4, y + 11); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#6c4734'; c.beginPath(); c.moveTo(x + 4, y + h * .65);
  c.bezierCurveTo(x + w * .4, y + h * .73, x + w * .7, y + h * .58, x + w - 21, y + h * .68);
  c.lineTo(x + w - 25, y + h); c.lineTo(x + 8, y + h - 2); c.closePath(); c.fill();
  c.strokeStyle = '#c28f60'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(x + 10, y + 11); c.bezierCurveTo(x + 32, y + 7, x + 54, y + 15, x + w - 35, y + 9); c.stroke();
  c.strokeStyle = '#543e30'; c.lineWidth = 1.7;
  for (const [frac, length] of [[.37, .55], [.56, .35], [.83, .6]]) {
    c.beginPath(); c.moveTo(x + 9, y + h * frac); c.bezierCurveTo(x + w * .25, y + h * frac - 4, x + w * .35, y + h * frac + 5, x + w * length, y + h * frac - 1); c.stroke();
  }
  c.fillStyle = '#d7ad79'; c.strokeStyle = '#543e30'; c.lineWidth = 2.5;
  const ex = x + w - 19, ey = y + h * .5;
  c.beginPath(); c.ellipse(ex, ey, 18, h / 2 - 2, -.03, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = '#9e7048'; c.lineWidth = 1.5;
  c.beginPath(); c.ellipse(ex - 1, ey + 1, 11, h * .32, .03, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.ellipse(ex + 1, ey + 3, 5, h * .15, -.07, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#795439'; c.beginPath(); c.moveTo(ex + 5, y + 5); c.lineTo(ex + 2, y + 17); c.lineTo(ex + 5, y + 25); c.stroke();
  c.fillStyle = '#617647'; c.beginPath(); c.moveTo(x + 9, y + 3); c.quadraticCurveTo(x + 29, y - 1, x + 41, y + 2); c.lineTo(x + 36, y + 8); c.lineTo(x + 23, y + 6); c.closePath(); c.fill();
  c.restore();
}
