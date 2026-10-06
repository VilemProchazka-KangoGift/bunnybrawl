// Character experiments use the production Meadow renderer and keep the arena unchanged.
import '../../../src/i18n';
import { Renderer } from '../../../src/engine/renderer';
import { drawCharacterCore } from '../../../src/engine/rendering/players';
import { meadow } from '../../../src/engine/arenas/packs/meadow';
import { registerArena, toArena, toThemeConfig } from '../../../src/engine/arenas/registry';
import { registerBuiltinCharacters } from '../../../src/engine/characters';
import { getCharacterPack } from '../../../src/engine/characters/registry';
import { createEmptyMatchState, createInitialPlayers } from '../../../src/engine/simulator/initialState';
import { getReactiveKind } from '../../../src/engine/gameLoop/cosmetics/reactiveDecorations';
import type { PlayerState } from '../../../src/engine/types';
import { registerPrototypePacks, STUDY_CHARACTERS, type PrototypeStyle } from './prototypePacks';
import { registerRasterConceptPacks, type RasterStyle } from './rasterConceptPacks';

const query = new URLSearchParams(location.search);
const style = query.get('style') ?? 'current';
const time = query.get('time') ?? 'day';
const rasterStyles = ['pocket-plush', 'floppy-beanbags', 'layered-felt'];
const isRaster = rasterStyles.includes(style);
if (!['current', 'plush', ...rasterStyles].includes(style)) throw new Error(`Unknown style: ${style}`);
if (!['day', 'night'].includes(time)) throw new Error(`Unknown time: ${time}`);
let seed = 7341;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

document.getElementById('title')!.textContent = ({
  current: 'Current characters', plush: 'Original soft toys',
  'pocket-plush': 'Pocket plush', 'floppy-beanbags': 'Floppy beanbags',
  'layered-felt': 'Layered felt',
} as Record<string, string>)[style];
if (isRaster) document.querySelector('.heading span')!.textContent =
  'Generated concept art in the production renderer · static sprites only; animation needs separate parts';

registerArena(meadow);
registerBuiltinCharacters();
if (isRaster) await registerRasterConceptPacks(style as RasterStyle);
else if (style !== 'current') registerPrototypePacks(style as PrototypeStyle);
const arena = toArena(meadow);
const theme = toThemeConfig(meadow);

function canvas(id: string): HTMLCanvasElement {
  const el = document.getElementById(id) as HTMLCanvasElement;
  el.width = 1280; el.height = 720;
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
state.dayPhase = time === 'night' ? .5 : 0;
state.players = createInitialPlayers(['P1', 'P2', 'P3', 'P4', 'P5'], arena, false, Math.random);
const positions = [[320, 380], [850, 395], [650, 470], [1040, 480], [605, 270]];
const poses: PlayerState[] = ['idle', 'run', 'airborne', 'idle', 'airborne'];
state.players.forEach((player, i) => {
  player.x = positions[i][0];
  player.y = positions[i][1] - player.height;
  player.state = poses[i];
  player.animFrame = i % 2 ? .5 : .25;
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

const lineup = document.getElementById('lineup') as HTMLCanvasElement;
const c = lineup.getContext('2d')!;
c.fillStyle = '#f4f0e5'; c.fillRect(0, 0, lineup.width, lineup.height);
c.fillStyle = '#a8b6aa'; c.fillRect(0, 0, lineup.width, 2);
for (let i = 0; i < STUDY_CHARACTERS.length; i++) {
  const name = STUDY_CHARACTERS[i];
  const pack = getCharacterPack(name)!;
  const left = 28 + i * 250;
  c.fillStyle = '#263e39'; c.font = 'bold 17px system-ui'; c.fillText(name, left, 27);
  c.fillStyle = '#52665e'; c.font = '12px system-ui';
  if (isRaster) {
    c.fillText('static concept · motion TBD', left, 193);
    c.save(); c.translate(left + 56, 57); c.scale(3, 3);
    drawCharacterCore(c, 16, 0, 32, 32, name, 'idle', .25, 1,
      { color: pack.color, darkColor: pack.darkColor, lightColor: pack.lightColor });
    c.restore();
    if (i < STUDY_CHARACTERS.length - 1) {
      c.strokeStyle = '#d6d6c9'; c.beginPath(); c.moveTo(left + 238, 18); c.lineTo(left + 238, 196); c.stroke();
    }
    continue;
  }
  for (const [poseIndex, pose] of (['idle', 'run', 'airborne'] as const).entries()) {
    const x = left + poseIndex * 78;
    c.fillText(pose === 'airborne' ? 'air' : pose, x, 193);
    c.save(); c.translate(x, 76); c.scale(2, 2);
    drawCharacterCore(c, 16, 0, 32, 32, name, pose, poseIndex === 1 ? .5 : .25, 1,
      { color: pack.color, darkColor: pack.darkColor, lightColor: pack.lightColor });
    c.restore();
  }
  if (i < STUDY_CHARACTERS.length - 1) {
    c.strokeStyle = '#d6d6c9'; c.beginPath(); c.moveTo(left + 238, 18); c.lineTo(left + 238, 196); c.stroke();
  }
}
document.documentElement.dataset.ready = 'true';
