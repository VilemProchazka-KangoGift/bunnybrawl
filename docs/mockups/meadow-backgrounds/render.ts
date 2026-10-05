// Mockup fixture: production Meadow renderer and art, with backdrop-only overrides.
import '../../../src/i18n';
import { Renderer } from '../../../src/engine/renderer';
import { meadow } from '../../../src/engine/arenas/packs/meadow';
import { registerArena, toArena, toThemeConfig } from '../../../src/engine/arenas/registry';
import { registerBuiltinCharacters } from '../../../src/engine/characters';
import { createEmptyMatchState, createInitialPlayers } from '../../../src/engine/simulator/initialState';
import { getReactiveKind } from '../../../src/engine/gameLoop/cosmetics/reactiveDecorations';
import { backgroundVariants, storybookClouds } from './variants';

const query = new URLSearchParams(location.search);
const variant = query.get('variant') ?? 'current';
const night = query.get('time') === 'night';
let seed = 7341;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

registerArena(meadow);
registerBuiltinCharacters();
const arena = toArena(meadow);
const theme = toThemeConfig(meadow);
if (variant === 'valley-and-clouds') {
  theme.hills = [];
  theme.clouds = { ...theme.clouds, count: 0 };
  theme.drawFarBackground = (ctx) => {
    backgroundVariants['wooded-valley'](ctx);
    storybookClouds(ctx);
  };
} else if (variant === 'storybook-clouds') {
  const originalFarBackground = theme.drawFarBackground;
  theme.clouds = { ...theme.clouds, count: 0 };
  theme.drawFarBackground = (ctx, currentArena) => {
    originalFarBackground?.(ctx, currentArena);
    storybookClouds(ctx);
  };
} else if (variant !== 'current') {
  const draw = backgroundVariants[variant];
  if (!draw) throw new Error(`Unknown background variant: ${variant}`);
  theme.hills = [];
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
