import { Howl } from 'howler';
import type { CharacterPack } from '../types';
import type { IdleAction } from '../../rendering/idleActions';
import { fillBodyGradient } from '../../spriteShading';
import { floatBufferToWavDataUri } from '../../audio/synthesis/wav';

const drawSprite: CharacterPack['drawSprite'] = (ctx, cx, yOff, w, h, _state, _animFrame, _isIdleAnim, _idleT, colors) => {
  fillBodyGradient(ctx, { cx, cy: yOff + h * 0.55, rx: w * 0.42, ry: h * 0.35 }, colors);
  ctx.fillStyle = colors.lightColor;
  ctx.beginPath();
  ctx.arc(cx - 7, yOff + 8, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 7, yOff + 8, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx - 6, yOff + 8, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 8, yOff + 8, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#90EE90';
  ctx.beginPath();
  ctx.ellipse(cx, yOff + h * 0.62, w * 0.25, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
};

// Closes both eyes during the middle 40% of the action. Drawn as overlay so it
// runs at full cosmetic-tick rate (the cached sprite freezes idleT at one bit).
const blinkAction: IdleAction = {
  id: 'frogBlink',
  duration: 0.7,
  apply: () => {},
  applyAfter: (ctx, cx, yOff, _w, _h, t, colors) => {
    if (t < 0.3 || t > 0.7) return;
    ctx.fillStyle = colors.lightColor;
    ctx.beginPath();
    ctx.arc(cx - 7, yOff + 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 7, yOff + 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 9, yOff + 8);
    ctx.lineTo(cx - 3, yOff + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 5, yOff + 8);
    ctx.lineTo(cx + 11, yOff + 8);
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
