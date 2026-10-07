// Mockup fixture: production Meadow renderer and art, with backdrop-only overrides.
import '../../../src/i18n';
import { Renderer } from '../../../src/engine/renderer';
import { meadow } from '../../../src/engine/arenas/packs/meadow';
import { registerArena, toArena, toThemeConfig } from '../../../src/engine/arenas/registry';
import { registerBuiltinCharacters } from '../../../src/engine/characters';
import { createEmptyMatchState, createInitialPlayers } from '../../../src/engine/simulator/initialState';
import { getReactiveKind } from '../../../src/engine/gameLoop/cosmetics/reactiveDecorations';
import type { Ctx2D } from '../../../src/engine/types';
import { backgroundVariants, storybookClouds, woodedValley } from './variants';

const query = new URLSearchParams(location.search);
const variant = query.get('variant') ?? 'current';
const time = query.get('time') ?? 'day';
let seed = 7341;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

registerArena(meadow);
registerBuiltinCharacters();
const arena = toArena(meadow);
const theme = toThemeConfig(meadow);
// Preserve the pre-redesign scene as a reproducible comparison after Meadow's
// production pack moves to the selected tall valley.
const previousHills = [
  { x: 0, baseY: 620, width: 300, height: 120, color: '#719981' },
  { x: 250, baseY: 630, width: 400, height: 100, color: '#719981' },
  { x: 600, baseY: 620, width: 350, height: 130, color: '#719981' },
  { x: 900, baseY: 635, width: 400, height: 100, color: '#719981' },
];
const previousClouds = {
  count: 5, color: 'rgba(255, 255, 248, 0.78)', minSize: 50, maxSize: 85,
  minSpeed: 6, maxSpeed: 12, yRange: [40, 100] as [number, number],
};
const previousTreeline = [
  0, 530, 30, 510, 55, 530, 80, 495, 110, 525, 140, 500,
  170, 520, 200, 490, 235, 515, 265, 485, 300, 510, 330, 495,
  365, 520, 395, 480, 430, 505, 460, 490, 500, 515, 535, 485,
  570, 510, 600, 475, 635, 500, 665, 490, 700, 510, 740, 480,
  775, 505, 810, 495, 845, 515, 880, 475, 920, 500, 955, 490,
  990, 510, 1025, 485, 1060, 505, 1095, 480, 1130, 500, 1165, 490,
  1200, 510, 1235, 485, 1270, 505, 1300, 520,
];
function drawPreviousTreeline(ctx: Ctx2D): void {
  ctx.fillStyle = 'rgba(86, 116, 147, 0.32)';
  ctx.beginPath(); ctx.moveTo(-10, 660);
  for (let i = 0; i < previousTreeline.length; i += 2) ctx.lineTo(previousTreeline[i], previousTreeline[i + 1]);
  ctx.lineTo(1300, 660); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(116, 148, 150, 0.23)';
  ctx.beginPath(); ctx.moveTo(-10, 660);
  for (let i = 0; i < previousTreeline.length; i += 2) ctx.lineTo(previousTreeline[i] + 15, previousTreeline[i + 1] + 25);
  ctx.lineTo(1300, 660); ctx.closePath(); ctx.fill();
}

if (variant === 'painted-landscape' || variant === 'painted-low-valley') {
  const plate = new Image();
  plate.src = new URL(variant === 'painted-low-valley'
    ? '../meadow-painted/low-valley-plate.png'
    : '../meadow-painted/landscape-plate.png', import.meta.url).href;
  await plate.decode();
  theme.hills = [];
  theme.drawFarBackground = (ctx) => {
    ctx.save();
    ctx.globalAlpha = 0.76;
    ctx.drawImage(plate, 0, 0, 1280, 720);
    ctx.restore();
  };
} else if (variant === 'valley-and-clouds' || variant === 'raised-hills' || variant === 'tall-hills') {
  const hillRise = variant === 'raised-hills' ? 38 : variant === 'tall-hills' ? 70 : 0;
  theme.hills = [];
  theme.clouds = { ...previousClouds, count: 0 };
  theme.drawFarBackground = (ctx) => {
    woodedValley(ctx, hillRise);
    storybookClouds(ctx);
  };
} else if (variant === 'storybook-clouds') {
  theme.hills = previousHills;
  theme.clouds = { ...previousClouds, count: 0 };
  theme.drawFarBackground = (ctx) => {
    drawPreviousTreeline(ctx);
    storybookClouds(ctx);
  };
} else if (variant === 'current') {
  theme.hills = previousHills;
  theme.clouds = previousClouds;
  theme.drawFarBackground = drawPreviousTreeline;
} else if (variant !== 'production') {
  const draw = backgroundVariants[variant];
  if (!draw) throw new Error(`Unknown background variant: ${variant}`);
  theme.hills = [];
  theme.clouds = previousClouds;
  theme.drawFarBackground = draw;
}

function canvas(id: string): HTMLCanvasElement {
  const el = document.getElementById(id) as HTMLCanvasElement;
  el.width = 1280;
  el.height = 720;
  return el;
}
const renderer = new Renderer({
  bgCanvas: canvas('bg'), bgNightCanvas: canvas('night'), fgCanvas: canvas('fg'),
  hudCanvas: canvas('hud'), fgNightTint: document.querySelector('.tint') as HTMLDivElement,
  theme,
});
const state = createEmptyMatchState();
state.phase = 'playing';
state.timeElapsed = 18;
state.dayPhase = time === 'night' ? 0.5 : time === 'sunset' ? 0.25 : 0;
state.players = createInitialPlayers(['P1', 'P2', 'P3', 'P4', 'P5'], arena, false, Math.random);
const positions = [[320, 380], [850, 395], [575, 620], [1040, 480], [605, 270]];
state.players.forEach((player, i) => {
  player.x = positions[i][0];
  player.y = positions[i][1] - player.height;
  player.score = [3, 2, 1, 2, 0][i];
  player.facing = i % 2 ? 'left' : 'right';
});
const instances = theme.buildReactiveDecorations?.(arena) ?? [];
const reactive = {
  prePlayer: instances.filter(i => getReactiveKind(i.kind)?.layer === 'prePlayer'),
  postPlayer: instances.filter(i => getReactiveKind(i.kind)?.layer === 'postPlayer'),
  windPhase: 0,
};
renderer.warmSpriteCache(state.players.map(p => p.character.name));
renderer.renderBackground(arena);
renderer.renderFrame(state, arena, [], 0, reactive);
document.documentElement.dataset.ready = 'true';
