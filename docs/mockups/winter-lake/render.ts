// Production Winter Lake renderer with only the distant backdrop overridden.
import '../../../src/i18n';
import { Renderer } from '../../../src/engine/renderer';
import { winterLake } from '../../../src/engine/arenas/packs/winterLake';
import { registerArena, toArena, toThemeConfig } from '../../../src/engine/arenas/registry';
import { registerBuiltinCharacters } from '../../../src/engine/characters';
import { getAllCharacters } from '../../../src/engine/characters/defaults';
import { registerPlayablePlushRoster } from '../../../src/engine/characters/plush/playableRoster';
import { createEmptyMatchState, createInitialPlayers } from '../../../src/engine/simulator/initialState';
import { drawBackdrop, skies, VARIANTS, type Variant } from './variants';

const query = new URLSearchParams(location.search);
const variant = query.get('variant') ?? 'current';
const time = query.get('time') ?? 'day';
if (!VARIANTS.includes(variant as Variant)) throw new Error(`Unknown background: ${variant}`);
if (time !== 'day' && time !== 'night') throw new Error(`Unknown time: ${time}`);

let seed = 7312;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

registerArena(winterLake);
registerBuiltinCharacters();
await registerPlayablePlushRoster();
const arena = toArena(winterLake);
const theme = toThemeConfig(winterLake);
if (variant !== 'current') {
  const selected = variant as Exclude<Variant, 'current'>;
  theme.sky = { gradient: skies[selected] };
  theme.hills = [];
  theme.drawFarBackground = drawBackdrop[selected];
}

function canvas(id: string): HTMLCanvasElement {
  const el = document.getElementById(id) as HTMLCanvasElement;
  el.width = 1280;
  el.height = 720;
  return el;
}

const renderer = new Renderer({
  bgCanvas: canvas('bg'), bgNightCanvas: canvas('night'), fgCanvas: canvas('fg'),
  fgNightTint: document.querySelector('.tint') as HTMLDivElement,
  lightCanvas: canvas('light'), hudCanvas: canvas('hud'), theme,
});
const state = createEmptyMatchState();
state.phase = 'playing';
state.timeElapsed = 18;
state.dayPhase = time === 'night' ? .5 : 0;
state.players = createInitialPlayers(['P1', 'P2', 'P3', 'P4', 'P5'], arena, false, Math.random);
const byName = new Map(getAllCharacters().map(character => [character.name, character]));
const placements = [
  ['Bunny', 85, 540], ['Frog', 180, 625], ['Fox', 620, 325],
  ['Wolf', 900, 625], ['Panda', 1150, 390],
] as const;
state.players.forEach((player, i) => {
  const [name, x, y] = placements[i];
  const character = byName.get(name);
  if (!character) throw new Error(`Missing ${name}`);
  player.character = character;
  player.x = x;
  player.y = y;
  player.score = 0;
  player.facing = i % 2 ? 'left' : 'right';
});
renderer.warmSpriteCache(state.players.map(player => player.character.name));
renderer.renderBackground(arena);
renderer.renderFrame(state, arena, []);
document.documentElement.dataset.ready = 'true';
