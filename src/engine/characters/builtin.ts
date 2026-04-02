/** Registers all 17 built-in characters into the character pack registry.
 *  Call this once at app startup before any game systems reference characters. */

import { registerCharacter } from './registry';
import type { CharacterPack, IdleTransformType } from './types';

// Sprite renderers
import {
  drawBunny, drawFox, drawFrog, drawBear, drawOwl,
  drawCat, drawWolf, drawPanda, drawPig, drawCow,
  drawGoat, drawHorse, drawSheep, drawMonkey, drawTiger,
  drawRhino, drawHedgehog,
} from './renderers/sprites';

// Gib renderers
import {
  drawBunnyGib, drawFoxGib, drawFrogGib, drawBearGib, drawOwlGib,
  drawCatGib, drawWolfGib, drawPandaGib, drawPigGib, drawCowGib,
  drawGoatGib, drawHorseGib, drawSheepGib, drawMonkeyGib, drawTigerGib,
  drawRhinoGib, drawHedgehogGib,
} from './gibRenderers/all';

// ---- Built-in character definitions ----

interface BuiltinCharDef {
  name: string;
  color: string;
  darkColor: string;
  lightColor: string;
  emoji: string;
  customEyes: boolean;
  idleTransform: IdleTransformType;
  splatShape: CharacterPack['splatShape'];
  gibs: CharacterPack['gibs'];
  sound: CharacterPack['sound'];
  drawSprite: CharacterPack['drawSprite'];
  drawGib: CharacterPack['drawGib'];
}

const BUILTINS: BuiltinCharDef[] = [
  {
    name: 'Bunny', color: '#FFFFFF', darkColor: '#CCCCCC', lightColor: '#FFFFFF',
    emoji: '\uD83D\uDC30', customEyes: false, idleTransform: 'none', splatShape: 'paw',
    gibs: [{ gibType: 'ear', width: 8, height: 20 }, { gibType: 'ear', width: 8, height: 20 }, { gibType: 'tail', width: 8, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'simple', freq: 800, duration: 0.1, waveform: 'square', genVol: 0.4, freqEnd: 1200 },
    drawSprite: drawBunny, drawGib: drawBunnyGib,
  },
  {
    name: 'Fox', color: '#FF8C00', darkColor: '#CC6600', lightColor: '#FFB347',
    emoji: '\uD83E\uDD8A', customEyes: false, idleTransform: 'none', splatShape: 'star',
    gibs: [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'tail', width: 16, height: 10 }, { gibType: 'snout', width: 8, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'simple', freq: 600, duration: 0.15, waveform: 'sawtooth', genVol: 0.4, freqEnd: 400 },
    drawSprite: drawFox, drawGib: drawFoxGib,
  },
  {
    name: 'Frog', color: '#32CD32', darkColor: '#228B22', lightColor: '#7CFC00',
    emoji: '\uD83D\uDC38', customEyes: true, idleTransform: 'none', splatShape: 'splat',
    gibs: [{ gibType: 'body', width: 12, height: 10 }, { gibType: 'body', width: 10, height: 10 }, { gibType: 'body', width: 11, height: 9 }],
    sound: { type: 'custom' },
    drawSprite: drawFrog, drawGib: drawFrogGib,
  },
  {
    name: 'Bear', color: '#8B4513', darkColor: '#654321', lightColor: '#D2691E',
    emoji: '\uD83D\uDC3B', customEyes: false, idleTransform: 'none', splatShape: 'circle',
    gibs: [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'snout', width: 10, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'simple', freq: 100, duration: 0.25, waveform: 'sawtooth', genVol: 0.4 },
    drawSprite: drawBear, drawGib: drawBearGib,
  },
  {
    name: 'Owl', color: '#9370DB', darkColor: '#6A4DB0', lightColor: '#B8A0E8',
    emoji: '\uD83E\uDD89', customEyes: true, idleTransform: 'headFlip', splatShape: 'ring',
    gibs: [{ gibType: 'wing', width: 12, height: 8 }, { gibType: 'wing', width: 12, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'segment', segments: [{ freq: 400, freqEnd: 300, duration: 0.15, type: 'sine' }, { freq: 300, freqEnd: 400, duration: 0.15, type: 'sine' }], genVol: 0.4 },
    drawSprite: drawOwl, drawGib: drawOwlGib,
  },
  {
    name: 'Cat', color: '#E8A030', darkColor: '#CC8A9A', lightColor: '#FFD4E0',
    emoji: '\uD83D\uDC31', customEyes: true, idleTransform: 'headTilt', splatShape: 'paw',
    gibs: [{ gibType: 'ear', width: 8, height: 10 }, { gibType: 'ear', width: 8, height: 10 }, { gibType: 'tail', width: 14, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'segment', segments: [{ freq: 700, freqEnd: 500, duration: 0.12, type: 'sine' }, { freq: 500, freqEnd: 600, duration: 0.12, type: 'sine' }], genVol: 0.4 },
    drawSprite: drawCat, drawGib: drawCatGib,
  },
  {
    name: 'Wolf', color: '#708090', darkColor: '#4A5A68', lightColor: '#A0B0C0',
    emoji: '\uD83D\uDC3A', customEyes: false, idleTransform: 'headBob', splatShape: 'star',
    gibs: [{ gibType: 'ear', width: 8, height: 12 }, { gibType: 'ear', width: 8, height: 12 }, { gibType: 'tail', width: 16, height: 10 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'segment', segments: [{ freq: 300, freqEnd: 500, duration: 0.2, type: 'sawtooth' }, { freq: 500, freqEnd: 400, duration: 0.15, type: 'sawtooth' }], genVol: 0.4 },
    drawSprite: drawWolf, drawGib: drawWolfGib,
  },
  {
    name: 'Panda', color: '#F0F0F0', darkColor: '#333333', lightColor: '#FFFFFF',
    emoji: '\uD83D\uDC3C', customEyes: true, idleTransform: 'headBob', splatShape: 'circle',
    gibs: [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'body', width: 14, height: 12 }, { gibType: 'body', width: 10, height: 10 }],
    sound: { type: 'simple', freq: 500, duration: 0.12, waveform: 'triangle', genVol: 0.4, freqEnd: 600 },
    drawSprite: drawPanda, drawGib: drawPandaGib,
  },
  {
    name: 'Pig', color: '#F4A6B0', darkColor: '#C88090', lightColor: '#FFD0D8',
    emoji: '\uD83D\uDC37', customEyes: false, idleTransform: 'headBob', splatShape: 'circle',
    gibs: [{ gibType: 'ear', width: 8, height: 10 }, { gibType: 'ear', width: 8, height: 10 }, { gibType: 'snout', width: 8, height: 6 }, { gibType: 'tail', width: 10, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'segment', segments: [{ freq: 250, freqEnd: 350, duration: 0.1, type: 'square' }, { freq: 350, freqEnd: 200, duration: 0.15, type: 'square' }], genVol: 0.4 },
    drawSprite: drawPig, drawGib: drawPigGib,
  },
  {
    name: 'Cow', color: '#F5F0E0', darkColor: '#4A3A2A', lightColor: '#FFFFFF',
    emoji: '\uD83D\uDC2E', customEyes: true, idleTransform: 'headBob', splatShape: 'splat',
    gibs: [{ gibType: 'horn', width: 8, height: 12 }, { gibType: 'horn', width: 8, height: 12 }, { gibType: 'tail', width: 14, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'simple', freq: 150, duration: 0.4, waveform: 'sine', genVol: 0.4, freqEnd: 130 },
    drawSprite: drawCow, drawGib: drawCowGib,
  },
  {
    name: 'Goat', color: '#C8B896', darkColor: '#8A7A60', lightColor: '#E8D8C0',
    emoji: '\uD83D\uDC10', customEyes: true, idleTransform: 'headBob', splatShape: 'star',
    gibs: [{ gibType: 'horn', width: 8, height: 14 }, { gibType: 'horn', width: 8, height: 14 }, { gibType: 'beard', width: 8, height: 10 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'segment', segments: [{ freq: 400, freqEnd: 300, duration: 0.12, type: 'sawtooth' }, { freq: 300, freqEnd: 350, duration: 0.12, type: 'sawtooth' }], genVol: 0.4 },
    drawSprite: drawGoat, drawGib: drawGoatGib,
  },
  {
    name: 'Horse', color: '#8B6040', darkColor: '#5C3A20', lightColor: '#B08060',
    emoji: '\uD83D\uDC34', customEyes: true, idleTransform: 'headBob', splatShape: 'circle',
    gibs: [{ gibType: 'ear', width: 8, height: 10 }, { gibType: 'ear', width: 8, height: 10 }, { gibType: 'mane', width: 12, height: 14 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'segment', segments: [{ freq: 500, freqEnd: 800, duration: 0.15, type: 'sawtooth' }, { freq: 800, freqEnd: 400, duration: 0.2, type: 'sawtooth' }], genVol: 0.4 },
    drawSprite: drawHorse, drawGib: drawHorseGib,
  },
  {
    name: 'Sheep', color: '#F0EDE8', darkColor: '#B0A898', lightColor: '#FFFFFF',
    emoji: '\uD83D\uDC11', customEyes: true, idleTransform: 'headBob', splatShape: 'paw',
    gibs: [{ gibType: 'ear', width: 8, height: 8 }, { gibType: 'ear', width: 8, height: 8 }, { gibType: 'wool', width: 14, height: 12 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'simple', freq: 350, duration: 0.3, waveform: 'sine', genVol: 0.4, freqEnd: 250 },
    drawSprite: drawSheep, drawGib: drawSheepGib,
  },
  {
    name: 'Monkey', color: '#B07040', darkColor: '#704020', lightColor: '#D09060',
    emoji: '\uD83D\uDC35', customEyes: true, idleTransform: 'headBob', splatShape: 'star',
    gibs: [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'tail', width: 16, height: 8 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'segment', segments: [{ freq: 800, freqEnd: 1200, duration: 0.1, type: 'square' }, { freq: 1200, freqEnd: 600, duration: 0.12, type: 'square' }], genVol: 0.4 },
    drawSprite: drawMonkey, drawGib: drawMonkeyGib,
  },
  {
    name: 'Tiger', color: '#E8820A', darkColor: '#1A1A1A', lightColor: '#FFD080',
    emoji: '\uD83D\uDC2F', customEyes: false, idleTransform: 'headBob', splatShape: 'paw',
    gibs: [{ gibType: 'ear', width: 10, height: 10 }, { gibType: 'ear', width: 10, height: 10 }, { gibType: 'snout', width: 8, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'segment', segments: [{ freq: 200, freqEnd: 120, duration: 0.2, type: 'sawtooth' }, { freq: 120, freqEnd: 80, duration: 0.25, type: 'sawtooth' }], genVol: 0.4, vol: 0.5 },
    drawSprite: drawTiger, drawGib: drawTigerGib,
  },
  {
    name: 'Rhino', color: '#8A8A8A', darkColor: '#5A5A5A', lightColor: '#B0B0B0',
    emoji: '\uD83E\uDD8F', customEyes: false, idleTransform: 'headBob', splatShape: 'circle',
    gibs: [{ gibType: 'ear', width: 8, height: 8 }, { gibType: 'ear', width: 8, height: 8 }, { gibType: 'horn', width: 8, height: 14 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'segment', segments: [{ freq: 100, freqEnd: 60, duration: 0.2, type: 'square' }, { freq: 60, freqEnd: 90, duration: 0.2, type: 'sine' }], genVol: 0.4, vol: 0.5 },
    drawSprite: drawRhino, drawGib: drawRhinoGib,
  },
  {
    name: 'Hedgehog', color: '#8B6B4A', darkColor: '#5C3D1E', lightColor: '#D4B896',
    emoji: '\uD83E\uDD94', customEyes: true, idleTransform: 'headBob', splatShape: 'star',
    gibs: [{ gibType: 'spine', width: 6, height: 10 }, { gibType: 'spine', width: 6, height: 10 }, { gibType: 'snout', width: 8, height: 6 }, { gibType: 'body', width: 14, height: 12 }],
    sound: { type: 'segment', segments: [{ freq: 600, freqEnd: 800, duration: 0.08, type: 'triangle' }, { freq: 800, freqEnd: 500, duration: 0.1, type: 'triangle' }], genVol: 0.4 },
    drawSprite: drawHedgehog, drawGib: drawHedgehogGib,
  },
];

/** Register all built-in characters. Must be called at app startup. */
export function registerBuiltinCharacters(): void {
  for (const def of BUILTINS) {
    registerCharacter(def);
  }
}
