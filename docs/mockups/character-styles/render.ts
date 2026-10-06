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
import { registerPocketBunnyRig } from '../../../src/engine/characters/prototypes/pocketBunnyRig';
import { registerBatchOnePreviewPacks } from '../character-roster-batch-1/previewPacks';
import { registerBatchTwoPreviewPacks } from '../character-roster-batch-2/previewPacks';

const query = new URLSearchParams(location.search);
const style = query.get('style') ?? 'current';
const time = query.get('time') ?? 'day';
const pose = query.get('pose') ?? 'run';
const frame = Number(query.get('frame') ?? 0) & 3;
const rasterStyles = ['pocket-plush', 'floppy-beanbags', 'layered-felt'];
const isRaster = rasterStyles.includes(style);
const isRig = style === 'pocket-bunny-rig';
const isBatchOne = style === 'roster-batch-1';
const isBatchTwoPreview = style === 'roster-batch-2';
const isBatchTwoOriginal = style === 'roster-batch-2-original';
if (!['current', 'plush', ...rasterStyles, 'pocket-bunny-rig', 'roster-batch-1', 'roster-batch-2', 'roster-batch-2-original'].includes(style)) throw new Error(`Unknown style: ${style}`);
if (!['day', 'night'].includes(time)) throw new Error(`Unknown time: ${time}`);
if (isRig && !['idle', 'blink', 'sit', 'sit-exit', 'crouch', 'crouch-run', 'impact', 'run', 'airborne', 'fastfall'].includes(pose)) throw new Error(`Unknown pose: ${pose}`);
let seed = 7341;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

document.getElementById('title')!.textContent = ({
  current: 'Current characters', plush: 'Original soft toys',
  'pocket-plush': 'Pocket plush', 'floppy-beanbags': 'Floppy beanbags',
  'layered-felt': 'Layered felt', 'pocket-bunny-rig': 'Pocket Plush Bunny authored poses',
  'roster-batch-1': 'Pocket Plush · Bunny, Fox and Frog pose preview',
  'roster-batch-2': 'Pocket Plush · Bear, Owl and Cat pose preview',
  'roster-batch-2-original': 'Original · Bunny, Fox, Cat, Bear and Owl',
} as Record<string, string>)[style];
if (isRaster) document.querySelector('.heading span')!.textContent =
  'Generated concept art in the production renderer · static sprites only; animation needs separate parts';
if (isRig) document.querySelector('.heading span')!.textContent =
  'Authored pose atlas in the production renderer · Bunny only · idle, sit, walk, jump, stomp, and impact';
if (isBatchOne) document.querySelector('.heading span')!.textContent =
  'Bunny prototype with new Fox and Frog pose sheets in the production renderer · visual preview only';
if (isBatchTwoPreview || isBatchTwoOriginal) document.querySelector('.heading span')!.textContent =
  'Same five characters, arena, positions, and lighting · compare the original and proposed day/night scenes';

registerArena(meadow);
registerBuiltinCharacters();
if (isRaster) await registerRasterConceptPacks(style as RasterStyle);
else if (isRig) {
  await registerRasterConceptPacks('pocket-plush');
  await registerPocketBunnyRig();
}
else if (isBatchOne) {
  await registerPocketBunnyRig();
  await registerBatchOnePreviewPacks();
}
else if (isBatchTwoPreview) {
  await registerPocketBunnyRig();
  await registerBatchOnePreviewPacks();
  await registerBatchTwoPreviewPacks();
}
else if (style !== 'current' && !isBatchTwoOriginal) registerPrototypePacks(style as PrototypeStyle);
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
if (isBatchTwoPreview || isBatchTwoOriginal) {
  const cat = getCharacterPack('Cat')!;
  state.players[2].character = { ...state.players[2].character, name: cat.name,
    color: cat.color, darkColor: cat.darkColor, lightColor: cat.lightColor };
}
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
  state.players[0].state = pose === 'fastfall' ? 'airborne'
    : ['sit-exit', 'crouch-run'].includes(pose) ? 'run'
      : ['blink', 'sit', 'crouch', 'impact'].includes(pose) ? 'idle' : pose as PlayerState;
  state.players[0].animFrame = frame;
  state.players[0].fastFalling = pose === 'fastfall';
  if (pose === 'blink' || pose === 'sit') {
    state.players[0].idleAction = pose === 'blink' ? 0 : 1;
    state.players[0].idleActionDuration = 1;
    state.players[0].idleActionTimer = .5;
  }
  if (pose === 'sit-exit') {
    const exitT = Math.max(0, Math.min(1, Number(query.get('exitT') ?? .3)));
    state.players[0].idleAction = 1;
    state.players[0].idleActionDuration = -.24;
    state.players[0].idleActionTimer = .24 * (1 - exitT);
  }
  if (pose === 'impact') state.players[0].squashScale = .8;
  if (pose === 'crouch' || pose === 'crouch-run') state.players[0].squashScale = .6;
  if (pose === 'crouch-run') state.players[0].animTimer = .06;
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
const lineupCharacters = isBatchTwoPreview || isBatchTwoOriginal
  ? ['Bunny', 'Fox', 'Cat', 'Bear', 'Owl'] : STUDY_CHARACTERS;
for (let i = 0; i < lineupCharacters.length; i++) {
  const name = lineupCharacters[i];
  const pack = getCharacterPack(name)!;
  const left = 28 + i * 250;
  c.fillStyle = '#263e39'; c.font = 'bold 17px system-ui'; c.fillText(name, left, 27);
  c.fillStyle = '#52665e'; c.font = '12px system-ui';
  if (isRig && name === 'Bunny') {
    for (const [poseIndex, sample] of (['idle', 'run', 'airborne', 'fastfall'] as const).entries()) {
      const x = left + poseIndex * 60;
      c.fillText(sample === 'airborne' ? 'jump' : sample, x, 193);
      c.save(); c.translate(x, 76); c.scale(2, 2);
      drawCharacterCore(c, 16, 0, 32, 32, name, sample === 'fastfall' ? 'airborne' : sample,
        sample === 'run' ? frame : 0, 1,
        { color: pack.color, darkColor: pack.darkColor, lightColor: pack.lightColor }, false, 0,
        sample === 'idle' ? 5 : sample === 'run' ? 1 : sample === 'airborne' ? 4 : 8);
      c.restore();
    }
    continue;
  }
  if (isRaster || isRig || isBatchOne || isBatchTwoPreview || isBatchTwoOriginal) {
    const note = isBatchTwoOriginal ? 'original character' : isBatchTwoPreview ? 'authored pose preview'
      : isBatchOne
      ? name === 'Bunny' ? 'playable prototype' : name === 'Fox' || name === 'Frog' ? 'authored poses · timing TBD' : 'original character'
      : 'static concept · motion TBD';
    c.fillText(note, left, 193);
    c.save(); c.translate(left + 56, 57); c.scale(3, 3);
    drawCharacterCore(c, 16, 0, 32, 32, name, 'idle', .25, 1,
      { color: pack.color, darkColor: pack.darkColor, lightColor: pack.lightColor });
    c.restore();
    if (i < lineupCharacters.length - 1) {
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
  if (i < lineupCharacters.length - 1) {
    c.strokeStyle = '#d6d6c9'; c.beginPath(); c.moveTo(left + 238, 18); c.lineTo(left + 238, 196); c.stroke();
  }
}
if (isRig) {
  const actions = document.getElementById('actions') as HTMLCanvasElement;
  actions.hidden = false;
  const ac = actions.getContext('2d')!;
  ac.fillStyle = '#e8e4d8'; ac.fillRect(0, 0, 1280, 155);
  ac.fillStyle = '#263e39'; ac.font = 'bold 17px system-ui';
  ac.fillText('Pocket Plush Bunny motion vocabulary', 28, 26);
  const pack = getCharacterPack('Bunny')!;
  const samples = [
    ['idle', 5], ['blink', 6], ['walk A', 1], ['walk pass', 2], ['walk B', 3],
    ['jump', 4], ['fast stomp', 8], ['impact', 9], ['idle sit', 7], ['held sit', 7], ['move+sit', 7],
  ] as const;
  samples.forEach(([label, index], i) => {
    const x = 30 + i * 113;
    ac.fillStyle = '#52665e'; ac.font = '12px system-ui'; ac.fillText(label, x, 145);
    ac.save(); ac.translate(x + 26, 42); ac.scale(1.8, 1.8);
    if (label === 'move+sit') {
      ac.translate(16, 32); ac.rotate(.06); ac.translate(-16, -32);
    }
    drawCharacterCore(ac, 16, 0, 32, 32, 'Bunny', 'idle', 0, 1,
      { color: pack.color, darkColor: pack.darkColor, lightColor: pack.lightColor }, false, 0, index);
    ac.restore();
  });
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
