export type SoundName = 'jump' | 'stomp' | 'victory' | 'select' | 'thornhit' | 'crunch' | 'bunny' | 'fox' | 'frog' | 'bear' | 'owl' | 'cat' | 'wolf' | 'panda' | 'pig' | 'cow' | 'goat' | 'horse' | 'sheep' | 'monkey' | 'tiger' | 'rhino' | 'hedgehog' | 'chick' | 'axolotl' | 'footstep_grass' | 'footstep_wood' | 'countdown_beep' | 'countdown_go' | 'oof' | 'splash' | 'crowd' |'geyser' | 'pigeon_scatter' | 'zero_g' | 'waterfall_ambient' | 'land' | 'headbonk' | 'bump' | 'spring' | 'crouch' | 'fastfall' | 'amb_wind' | 'amb_lava' | 'amb_space_hum' | 'amb_bird_chirp' | 'amb_ghost_hoo' | 'amb_volcano_burst';

export interface ToneSegment {
  freq: number;
  freqEnd?: number;
  duration: number;
  type: OscillatorType;
}
