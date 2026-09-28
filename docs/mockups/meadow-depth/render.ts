// Design-only fixture. Not imported by the game or included in its bundle.
import '../../../src/i18n';
import { Renderer } from '../../../src/engine/renderer';
import { meadow } from '../../../src/engine/arenas/packs/meadow';
import { registerArena, toArena, toThemeConfig } from '../../../src/engine/arenas/registry';
import { registerBuiltinCharacters } from '../../../src/engine/characters';
import { createEmptyMatchState, createInitialPlayers } from '../../../src/engine/simulator/initialState';
import { getReactiveKind } from '../../../src/engine/gameLoop/cosmetics/reactiveDecorations';
import type { Ctx2D } from '../../../src/engine/types';

const query = new URLSearchParams(location.search);
const option = query.get('option') ?? 'current';
const night = query.get('time') === 'night';
const palettes: Record<string, {sky: string[]; hill: string; far: string[]; cloud: string}> = {
  a: {sky: ['#91B9D5', '#D2E4E5', '#E8EFDC'], hill: '#8AA895', far: ['rgba(97,131,138,.26)', 'rgba(126,156,154,.22)'], cloud: 'rgba(255,253,242,.66)'},
  b: {sky: ['#D8B7A6', '#F2DCC1', '#F4E9CB'], hill: '#A7AD8E', far: ['rgba(132,117,140,.24)', 'rgba(151,143,151,.22)'], cloud: 'rgba(255,249,230,.65)'},
  c: {sky: ['#9EAED0', '#C9DCE0', '#DCE8DB'], hill: '#81A5A1', far: ['rgba(83,115,142,.28)', 'rgba(108,143,154,.22)'], cloud: 'rgba(240,248,255,.62)'},
};

// Repeatable atmosphere and cloud placement for every candidate.
let seed = 7341;
Math.random = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
registerArena(meadow);
registerBuiltinCharacters();
const arena = toArena(meadow);
const theme = toThemeConfig(meadow);
const palette = palettes[option];
if (palette) {
  theme.sky = {gradient: theme.sky.gradient.map((stop, i) => ({...stop, color: palette.sky[i]}))};
  theme.hills = theme.hills.map(hill => ({...hill, color: palette.hill}));
  theme.clouds = {...theme.clouds, color: palette.cloud};
  // Recolour the pack's original paths, preserving all background geometry.
  const draw = theme.drawFarBackground!;
  theme.drawFarBackground = (ctx, a) => {
    const proxy = new Proxy(ctx, {
      get(target, key) { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; },
      set(target, key, value) {
        if (key === 'fillStyle') {
          if (value === 'rgba(58,106,58,0.25)') value = palette.far[0];
          if (value === 'rgba(74,122,74,0.18)') value = palette.far[1];
        }
        return Reflect.set(target, key, value, target);
      },
    });
    draw(proxy as Ctx2D, a);
  };
}
const canvas = (id: string) => {const el = document.getElementById(id) as HTMLCanvasElement; el.width = 1280; el.height = 720; return el;};
const renderer = new Renderer({bgCanvas: canvas('bg'), bgNightCanvas: canvas('night'), fgCanvas: canvas('fg'), hudCanvas: canvas('hud'), fgNightTint: document.querySelector('.tint') as HTMLDivElement, theme});
const state = createEmptyMatchState();
state.phase = 'playing';
state.timeElapsed = 18;
state.dayPhase = night ? 0.5 : 0;
state.players = createInitialPlayers(['P1','P2','P3','P4','P5'], arena, false, Math.random);
// A fixed spread of characters against sky, distant scenery, and foliage.
const positions = [[320, 380], [850, 395], [575, 620], [1040, 480], [605, 270]];
state.players.forEach((player, i) => {
  player.x = positions[i][0]; player.y = positions[i][1] - player.height;
  player.score = [3,2,1,2,0][i]; player.facing = i % 2 ? 'left' : 'right';
});
const instances = theme.buildReactiveDecorations?.(arena) ?? [];
const reactive = {prePlayer: instances.filter(i => getReactiveKind(i.kind)?.layer === 'prePlayer'), postPlayer: instances.filter(i => getReactiveKind(i.kind)?.layer === 'postPlayer'), windPhase: 0};
renderer.warmSpriteCache(state.players.map(p => p.character.name));
renderer.renderBackground(arena);
renderer.renderFrame(state, arena, [], 0, reactive);
document.documentElement.dataset.ready = 'true';
