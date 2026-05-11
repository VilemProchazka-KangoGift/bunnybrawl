/**
 * Per-character voice-sound registry. Each character's `.audio.ts` file
 * (in `characters/packs/`) self-registers its Howl factory by calling
 * `registerCharacterVoice('Name', () => new Howl(...))` at module
 * top level. `audio/soundRegistry.ts > registerAllSounds` then iterates
 * the registry at AudioManager init.
 *
 * Dependency direction: characters → audio (one-way). The audio module
 * exposes this registry and doesn't need to import anything from
 * `characters/` — character packs stay self-contained.
 *
 * Worker safety: `characters/builtinSounds.ts` (the manifest that
 * triggers the per-pack side-effect imports) is loaded only by `App.tsx`
 * on main. The sim-in-worker bundle never imports it, so Howler never
 * enters the worker module graph.
 */

import type { Howl } from 'howler';

type VoiceFactory = () => Howl;

const REGISTRY = new Map<string, VoiceFactory>();

/** Associate a character display-name with a Howl-producing factory.
 *  Called from each `packs/<name>.audio.ts` at module top level. */
export function registerCharacterVoice(name: string, factory: VoiceFactory): void {
  REGISTRY.set(name, factory);
}

/** Iterate registered (name → factory) pairs. Consumed by
 *  `soundRegistry.ts > registerAllSounds` once at AudioManager init. */
export function getCharacterVoices(): ReadonlyMap<string, VoiceFactory> {
  return REGISTRY;
}

/** Test helper: drop all registered factories. Production code never
 *  calls this. */
export function clearCharacterVoicesForTest(): void {
  REGISTRY.clear();
}
