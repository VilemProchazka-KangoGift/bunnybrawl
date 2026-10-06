import { registerBuiltinCharacters } from '../../../src/engine/characters/builtin';
import { getCharacterPack } from '../../../src/engine/characters/registry';
import { drawCharacterCore } from '../../../src/engine/rendering/players';
import { isRemainingAnimal, previewSize } from './roster';

const requested = new URLSearchParams(location.search).get('animal');
if (!isRemainingAnimal(requested)) throw new Error(`Unknown animal: ${requested}`);
const animal = requested;
const canvas = document.querySelector<HTMLCanvasElement>('#board')!;
const ctx = canvas.getContext('2d')!;
registerBuiltinCharacters();
const pack = getCharacterPack(animal)!;
const source = new Image();
source.src = `./${animal.toLowerCase()}-poses-atlas.png`;
await source.decode();

const labels = [
  'Resting idle', 'Walk contact A', 'Walk passing', 'Walk contact B', 'Jump',
  'Attentive idle', 'Blink', 'Sit', 'Fast stomp', 'Landing impact',
] as const;
const states = [
  'idle', 'run', 'run', 'run', 'airborne',
  'idle', 'idle', 'idle', 'airborne', 'idle',
] as const;
const frames = [0, 0, 1, 2, 0, 0, 0, 0, 0, 0];
const titleColor = '#2b4039';
ctx.fillStyle = '#eeeade';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = titleColor;
ctx.font = 'bold 30px system-ui';
ctx.fillText(`${animal} · Pocket Plush pose study`, 42, 44);
ctx.font = '15px system-ui';
ctx.fillStyle = '#607067';
ctx.fillText('Original procedural character above · proposed authored pose below · native-size pair at each tile foot', 42, 72);

function original(index: number, x: number, footY: number, scale: number): void {
  ctx.save();
  ctx.translate(x - 16 * scale, footY - 32 * scale);
  ctx.scale(scale, scale);
  drawCharacterCore(ctx, 16, 0, 32, 32, animal, states[index], frames[index],
    index === 7 ? .6 : index === 9 ? .8 : 1,
    { color: pack.color, darkColor: pack.darkColor, lightColor: pack.lightColor });
  ctx.restore();
}

function proposed(index: number, x: number, footY: number, scale: number): void {
  const cellW = source.width / 5;
  const cellH = source.height / 2;
  const drawW = previewSize[animal] * scale;
  ctx.drawImage(source, (index % 5) * cellW, Math.floor(index / 5) * cellH, cellW, cellH,
    x - drawW / 2, footY - previewSize[animal] * scale, drawW, previewSize[animal] * scale);
}

labels.forEach((label, index) => {
  const col = index % 5;
  const row = Math.floor(index / 5);
  const left = 40 + col * 264;
  const top = 93 + row * 447;
  const center = left + 127;
  ctx.fillStyle = row === 0 ? '#faf8f1' : '#f7f4eb';
  ctx.fillRect(left, top, 248, 430);
  ctx.strokeStyle = '#c9d0bd';
  ctx.lineWidth = 1;
  ctx.strokeRect(left + .5, top + .5, 247, 429);
  ctx.fillStyle = titleColor;
  ctx.font = 'bold 17px system-ui';
  ctx.fillText(label, left + 13, top + 27);
  ctx.fillStyle = '#718179';
  ctx.font = '12px system-ui';
  ctx.fillText('ORIGINAL', left + 14, top + 52);
  original(index, center, top + 166, 2.7);
  ctx.strokeStyle = '#dedbcf';
  ctx.beginPath(); ctx.moveTo(left + 12, top + 178); ctx.lineTo(left + 236, top + 178); ctx.stroke();
  ctx.fillStyle = '#718179';
  ctx.fillText('POCKET PLUSH', left + 14, top + 199);
  proposed(index, center, top + 348, 2.7);
  ctx.fillStyle = '#718179';
  ctx.fillText('Actual game scale:', left + 14, top + 405);
  original(index, left + 154, top + 413, 1);
  proposed(index, left + 202, top + 413, 1);
});

document.documentElement.dataset.ready = 'true';
