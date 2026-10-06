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
import { registerPocketBunnyRig } from './pocketBunnyRig';

const query = new URLSearchParams(location.search);
const style = query.get('style') ?? 'current';
const time = query.get('time') ?? 'day';
const pose = query.get('pose') ?? 'run';
const frame = Number(query.get('frame') ?? 0) & 3;
const rasterStyles = ['pocket-plush', 'floppy-beanbags', 'layered-felt'];
const isRaster = rasterStyles.includes(style);
const isRig = style === 'pocket-bunny-rig';
if (!['current', 'plush', ...rasterStyles, 'pocket-bunny-rig'].includes(style)) throw new Error(`Unknown style: ${style}`);
if (!['day', 'night'].includes(time)) throw new Error(`Unknown time: ${time}`);
if (isRig && !['idle', 'run', 'airborne', 'fastfall'].includes(pose)) throw new Error(`Unknown pose: ${pose}`);
let seed = 7341;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

document.getElementById('title')!.textContent = ({
  current: 'Current characters', plush: 'Original soft toys',
  'pocket-plush': 'Pocket plush', 'floppy-beanbags': 'Floppy beanbags',
  'layered-felt': 'Layered felt', 'pocket-bunny-rig': 'Pocket Plush Bunny motion rig',
} as Record<string, string>)[style];
if (isRaster) document.querySelector('.heading span')!.textContent =
  'Generated concept art in the production renderer · static sprites only; animation needs separate parts';
if (isRig) document.querySelector('.heading span')!.textContent =
  'Prototype cutout rig in the production renderer · Bunny only · four cached run frames, jump and fast fall';

registerArena(meadow);
registerBuiltinCharacters();
if (isRaster) await registerRasterConceptPacks(style as RasterStyle);
else if (isRig) {
  await registerRasterConceptPacks('pocket-plush');
  await registerPocketBunnyRig();
}
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
if (isRig) {
  state.players[0].state = pose === 'fastfall' ? 'airborne' : pose as PlayerState;
  state.players[0].animFrame = frame;
  state.players[0].fastFalling = pose === 'fastfall';
  state.players[0].x += Number(query.get('dx') ?? 0);
  state.players[0].y += Number(query.get('dy') ?? 0);
}
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
  if (isRig && name === 'Bunny') {
    for (const [poseIndex, sample] of (['idle', 'run', 'airborne', 'fastfall'] as const).entries()) {
      const x = left + poseIndex * 55;
      c.fillText(sample === 'airborne' ? 'jump' : sample, x, 193);
      c.save(); c.translate(x, 76); c.scale(2.5, 2.5);
      if (sample === 'fastfall') {
        c.translate(16, 16); c.scale(.85, 1.15); c.translate(-16, -16);
      }
      drawCharacterCore(c, 16, 0, 32, 32, name, sample === 'fastfall' ? 'airborne' : sample,
        sample === 'run' ? frame : 0, 1,
        { color: pack.color, darkColor: pack.darkColor, lightColor: pack.lightColor });
      c.restore();
    }
    continue;
  }
  if (isRaster || isRig) {
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
Object.assign(window, { benchmarkMockup: (count = 400) => {
  // Warm all run cache entries before timing steady-state production frames.
  const bunny = state.players[0];
  bunny.state = 'run';
  bunny.fastFalling = false;
  for (let i = 0; i < 8; i++) {
    bunny.animFrame = i & 3;
    renderer.renderFrame(state, arena, [], 0, reactive);
  }
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    bunny.animFrame = i & 3;
    renderer.renderFrame(state, arena, [], 0, reactive);
  }
  return (performance.now() - start) / count;
} });
document.documentElement.dataset.ready = 'true';
