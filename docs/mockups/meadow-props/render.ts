// Isolated visual fixture: uses the production arena and renderer, never enters the game bundle.
import '../../../src/i18n';
import { Renderer } from '../../../src/engine/renderer';
import { meadow } from '../../../src/engine/arenas/packs/meadow';
import { registerArena, toArena, toThemeConfig } from '../../../src/engine/arenas/registry';
import { registerBuiltinCharacters } from '../../../src/engine/characters';
import { createEmptyMatchState, createInitialPlayers } from '../../../src/engine/simulator/initialState';
import { getReactiveKind } from '../../../src/engine/gameLoop/cosmetics/reactiveDecorations';
import { getFloatingPlatforms } from '../../../src/engine/themes/utils';
import { drawFgLeafCluster, drawGrassTuft } from '../../../src/engine/themes/drawPrimitives';
import { studies } from './variants';

const query = new URLSearchParams(location.search);
const study = studies[query.get('variant') as keyof typeof studies];
const night = query.get('time') === 'night';
let seed = 7341;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
registerArena(meadow);
registerBuiltinCharacters();
const arena = toArena(meadow);
const theme = toThemeConfig(meadow);

if (study) {
  const flowerColors = ['#FF6B8A', '#FFD700', '#FF69B4', '#87CEEB', '#DDA0DD', '#FFA07A'];
  theme.drawPlatform = (ctx, p, isGround) => study.drawPlatform(ctx, p, isGround);
  theme.drawPlatformOverlay = (ctx, p, isGround) => {
    if (p.style === 'stump') return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y + 4, p.width, p.height - 4);
    ctx.clip();
    study.drawPlatform(ctx, p, isGround);
    ctx.restore();
  };
  theme.drawBackgroundNature = (ctx, currentArena) => {
    const gy = currentArena.platforms[0].y;
    for (const [x, size] of [[200, 30], [450, 22], [700, 28], [950, 25], [1100, 20]]) {
      study.drawBush(ctx, x, gy, size, false);
    }
    for (const x of [150, 280, 420, 500, 580, 750, 930, 980, 1050, 1200]) {
      study.drawFlower(ctx, x, gy, flowerColors[Math.floor(x * 0.01) % flowerColors.length]);
    }
    study.drawMushroom(ctx, 240, gy);
    study.drawMushroom(ctx, 720, gy);
    for (const p of getFloatingPlatforms(currentArena.platforms)) {
      const mid = p.x + p.width / 2;
      if (p.width > 180) {
        study.drawBush(ctx, mid - 30, p.y, 15, false);
        study.drawFlower(ctx, p.x + 20, p.y, '#FFD700');
        study.drawFlower(ctx, p.x + p.width - 25, p.y, '#FF69B4');
        drawGrassTuft(ctx, p.x + 10, p.y);
        drawGrassTuft(ctx, p.x + p.width - 15, p.y);
      } else {
        study.drawFlower(ctx, mid - 10, p.y, '#DDA0DD');
        drawGrassTuft(ctx, p.x + 8, p.y);
      }
    }
  };
  theme.drawForegroundNature = (ctx, currentArena) => {
    const gy = currentArena.platforms[0].y;
    for (const [x, size] of [[160, 60], [520, 52], [1000, 55], [1120, 48]]) {
      study.drawBush(ctx, x, gy, size, true);
    }
    const floats = getFloatingPlatforms(currentArena.platforms);
    for (let pi = 0; pi < floats.length; pi++) {
      const p = floats[pi];
      if (p.width > 180) {
        study.drawBush(ctx, p.x + p.width * 0.15, p.y, pi % 2 === 0 ? 45 : 18, true);
        study.drawBush(ctx, p.x + p.width * 0.85, p.y, pi % 2 === 0 ? 18 : 42, true);
        drawFgLeafCluster(ctx, p.x + p.width / 2, p.y);
      } else {
        study.drawBush(ctx, p.x + p.width * 0.5, p.y, pi % 3 === 0 ? 38 : 16, true);
      }
    }
    for (const [x, color, height] of [[240, '#FF6B8A', 18], [580, '#DDA0DD', 20], [930, '#FFD700', 16], [1180, '#FF69B4', 22]] as const) {
      study.drawFlower(ctx, x, gy, color, height);
    }
  };
}

const canvas = (id: string) => {
  const el = document.getElementById(id) as HTMLCanvasElement;
  el.width = 1280;
  el.height = 720;
  return el;
};
const renderer = new Renderer({
  bgCanvas: canvas('bg'), bgNightCanvas: canvas('night'), fgCanvas: canvas('fg'), hudCanvas: canvas('hud'),
  fgNightTint: document.querySelector('.tint') as HTMLDivElement, theme,
});
const state = createEmptyMatchState();
state.phase = 'playing';
state.timeElapsed = 18;
state.dayPhase = night ? 0.5 : 0;
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
