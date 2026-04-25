import { Howl } from 'howler';
import type { CharacterPack } from '../types';
import type { IdleAction } from '../../rendering/idleActions';
import { fillBodyGradient } from '../../spriteShading';
import { floatBufferToWavDataUri } from '../../audio/synthesis/wav';

const EYE_DX = 7;
const EYE_Y = 8;
const EYE_R = 6;
// Pupils are offset 1px right of the eye-white centers — a fixed rightward gaze
// the closed lids must stay centered on, not on the eye-white centers.
const LEFT_PUPIL_DX = -6;
const RIGHT_PUPIL_DX = 8;
const LID_HALF = 3;

function drawEyeWhites(ctx: CanvasRenderingContext2D, cx: number, yOff: number, lightColor: string): void {
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.arc(cx - EYE_DX, yOff + EYE_Y, EYE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + EYE_DX, yOff + EYE_Y, EYE_R, 0, Math.PI * 2);
  ctx.fill();
}

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.55, rx: w * 0.42, ry: h * 0.35 }, colors);
  drawEyeWhites(ctx, cx, yOff, colors.lightColor);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx + LEFT_PUPIL_DX, yOff + EYE_Y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + RIGHT_PUPIL_DX, yOff + EYE_Y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#90EE90';
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.62, w * 0.25, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
};

// idleT is frozen in the cached sprite (1-bit cache key), so the blink must
// run after drawImage to actually animate.
const blinkAction: IdleAction = {
  id: 'frogBlink',
  duration: 0.7,
  weight: 2,
  apply: () => {},
  applyAfter: (ctx, cx, yOff, _w, _h, t, colors) => {
    if (t < 0.3 || t > 0.7) return;
    drawEyeWhites(ctx, cx, yOff, colors.lightColor);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + LEFT_PUPIL_DX - LID_HALF, yOff + EYE_Y);
    ctx.lineTo(cx + LEFT_PUPIL_DX + LID_HALF, yOff + EYE_Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + RIGHT_PUPIL_DX - LID_HALF, yOff + EYE_Y);
    ctx.lineTo(cx + RIGHT_PUPIL_DX + LID_HALF, yOff + EYE_Y);
    ctx.stroke();
  },
};

const drawGib: CharacterPack['drawGib'] = (_ctx, _gibType, _w, _h, _colors) => {
  // No non-body gibs for frog
};

export const frog: CharacterPack = {
  name: 'Frog',
  color: '#32CD32', darkColor: '#228B22', lightColor: '#7CFC00',
  emoji: '\uD83D\uDC38', customEyes: true,
  splatShape: 'splat',
  gibs: [{ gibType: 'body', width: 12, height: 10 }, { gibType: 'body', width: 10, height: 10 }, { gibType: 'body', width: 11, height: 9 }],
  translations: { en: 'Frog', cs: 'Žába', hi: 'मेंढक', fil: 'Palaka' },
  legStyle: { shape: 'wide', footStyle: 'webbed', legWidth: 5, spreadAngle: 4 },
  bodyEllipse: (cx, yOff, w, h) => ({ cx, cy: yOff + h * 0.55, rx: w * 0.42, ry: h * 0.35 }),
  idleActions: { custom: [blinkAction] },
  drawSprite, drawGib,
  createSound: () => {
    const sampleRate = 44100;
    const duration = 0.2;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const progress = i / numSamples;
      const freq = 200 + (150 - 200) * progress;
      const wobble = Math.sin(2 * Math.PI * 30 * t) * 20;
      const actualFreq = freq + wobble;
      const envelope = Math.max(0, 1 - progress) * 0.4;
      const phase = (t * actualFreq) % 1;
      const sample = phase < 0.5 ? 1 : -1;
      buffer[i] = sample * envelope;
    }
    return new Howl({ src: [floatBufferToWavDataUri(buffer, sampleRate)], volume: 0.4 });
  },
};
