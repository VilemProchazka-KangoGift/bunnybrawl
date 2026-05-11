// Per-character voice-sound registry. Each `packs/<name>.audio.ts` calls
// `registerCharacterVoice` at module top level; `soundRegistry.ts` iterates
// at AudioManager init. Keeping the registry in `audio/` keeps the dependency
// arrow flowing characters → audio (never the reverse) so visual pack files
// don't have to know this exists.

import type { Howl } from 'howler';

type VoiceFactory = () => Howl;

const REGISTRY = new Map<string, VoiceFactory>();

export function registerCharacterVoice(name: string, factory: VoiceFactory): void {
  REGISTRY.set(name, factory);
}

export function getCharacterVoices(): ReadonlyMap<string, VoiceFactory> {
  return REGISTRY;
}

export function clearCharacterVoicesForTest(): void {
  REGISTRY.clear();
}
