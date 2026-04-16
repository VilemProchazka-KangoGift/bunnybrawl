// Re-export shim — all audio logic now lives in audio/ directory
export { audio } from './audio/AudioManager';
export type { SoundName, ToneSegment } from './audio/types';
export { floatBufferToWavDataUri } from './audio/synthesis/wav';
