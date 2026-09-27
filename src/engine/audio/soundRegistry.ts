import { Howl } from 'howler';
import { getCharacterVoices } from './characterVoices';
import {
  generateJumpSound, generateStompSound, generateVictorySound,
  generateSelectSound, generateThornHitSound, generateCrunchSound,
  generateFootstepGrass, generateFootstepWood, generateOofSound,
  generateSplashSound, generateLandSound, generateHeadbonkSound,
  generateBumpSound, generateSpringSound, generateCrouchSound,
  generateFastfallSound,
} from './synthesis/sfx';
import {
  generateCrowdSound, generateZeroGSound,
  generateWaterfallSound, generateAmbWindSound, generateAmbLavaSound,
  generateAmbSpaceHumSound,
} from './synthesis/ambient';
import {
  generateGeyserSound, generatePigeonScatterSound,
  generateAmbBirdChirpSound, generateAmbGhostHooSound,
  generateAmbVolcanoBurstSound,
} from './synthesis/periodic';
import { generateToneBuffer } from './synthesis/core';

interface SoundDef {
  generate: () => string;
  volume: number;
  loop?: boolean;
}

const SFX_DEFS: Array<[string, SoundDef]> = [
  ['jump',       { generate: generateJumpSound, volume: 0.3 }],
  ['stomp',      { generate: generateStompSound, volume: 0.6 }],
  ['victory',    { generate: generateVictorySound, volume: 0.4 }],
  ['select',     { generate: generateSelectSound, volume: 0.3 }],
  ['thornhit',   { generate: generateThornHitSound, volume: 0.8 }],
  ['crunch',     { generate: generateCrunchSound, volume: 0.6 }],
  ['footstep_grass', { generate: generateFootstepGrass, volume: 0.15 }],
  ['footstep_wood',  { generate: generateFootstepWood, volume: 0.15 }],
  ['countdown_beep', { generate: () => generateToneBuffer(440, 0.15, 'square', 0.3), volume: 0.4 }],
  ['countdown_go',   { generate: () => generateToneBuffer(880, 0.32, 'square', 0.4), volume: 0.5 }],
  ['oof',        { generate: generateOofSound, volume: 0.6 }],
  ['splash',     { generate: generateSplashSound, volume: 0.5 }],
  ['land',       { generate: generateLandSound, volume: 0.5 }],
  ['headbonk',   { generate: generateHeadbonkSound, volume: 1.0 }],
  ['bump',       { generate: generateBumpSound, volume: 1.0 }],
  ['spring',     { generate: generateSpringSound, volume: 1.0 }],
  ['crouch',     { generate: generateCrouchSound, volume: 0.7 }],
  ['fastfall',   { generate: generateFastfallSound, volume: 0.9 }],
];

const AMBIENT_DEFS: Array<[string, SoundDef]> = [
  ['crowd',      { generate: generateCrowdSound, volume: 0 }],
  ['zero_g',     { generate: generateZeroGSound, volume: 0.15, loop: true }],
  ['waterfall_ambient', { generate: generateWaterfallSound, volume: 0.18, loop: true }],
  ['amb_wind',   { generate: generateAmbWindSound, volume: 0.55, loop: true }],
  ['amb_lava',   { generate: generateAmbLavaSound, volume: 0.6, loop: true }],
  ['amb_space_hum', { generate: generateAmbSpaceHumSound, volume: 0.55, loop: true }],
];

const PERIODIC_DEFS: Array<[string, SoundDef]> = [
  ['geyser',       { generate: generateGeyserSound, volume: 0.3 }],
  ['pigeon_scatter', { generate: generatePigeonScatterSound, volume: 0.25 }],
  ['amb_bird_chirp', { generate: generateAmbBirdChirpSound, volume: 0.5 }],
  ['amb_ghost_hoo',  { generate: generateAmbGhostHooSound, volume: 0.65 }],
  ['amb_volcano_burst', { generate: generateAmbVolcanoBurstSound, volume: 0.8 }],
];

function registerDefs(sounds: Map<string, Howl>, defs: Array<[string, SoundDef]>): void {
  for (const [name, def] of defs) {
    sounds.set(name, new Howl({
      src: [def.generate()],
      volume: def.volume,
      loop: def.loop,
    }));
  }
}

export function registerAllSounds(sounds: Map<string, Howl>): void {
  registerDefs(sounds, SFX_DEFS);
  registerDefs(sounds, AMBIENT_DEFS);
  registerDefs(sounds, PERIODIC_DEFS);

  // Register character voice sounds from the main-only factory registry
  // populated by side-effect imports in `characters/builtinSounds.ts`.
  for (const [name, factory] of getCharacterVoices()) {
    sounds.set(name.toLowerCase(), factory());
  }
}
