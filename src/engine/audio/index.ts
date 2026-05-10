export type { SoundName } from './types';
export type { ToneSegment } from './types';
export { floatBufferToWavDataUri } from './synthesis/wav';

/**
 * Worker-aware `audio` export. The branch not taken is never fetched, so
 * howler doesn't enter the worker module graph regardless of Vite's
 * shared-transform cache. Top-level await is fine for ESM consumers.
 */
import { isWorkerScope } from '../isWorker';
export const audio = isWorkerScope
  ? (await import('../worker/stubs/audio-worker-stub')).audio
  : (await import('./AudioManager')).audio;
