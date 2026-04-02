import type { CharacterPack, CharacterRenderer, GibRenderer } from './types';
import type { CharacterDef, SplatShape } from '../types';
import type { GibDef } from '../stomp';
import { fallbackSpriteRenderer, fallbackGibRenderer } from './fallbacks';

// ---- Registry ----

const PACKS: Map<string, CharacterPack> = new Map();

/** Register a character pack. Overwrites any existing pack with the same name. */
export function registerCharacter(pack: CharacterPack): void {
  PACKS.set(pack.name, pack);
}

/** Get a character pack by name. Returns undefined for unknown characters. */
export function getCharacterPack(name: string): CharacterPack | undefined {
  return PACKS.get(name);
}

/** List all registered character names. */
export function listCharacterNames(): string[] {
  return Array.from(PACKS.keys());
}

/** List all registered character packs. */
export function listCharacterPacks(): CharacterPack[] {
  return Array.from(PACKS.values());
}

// ---- Convenience lookups (replace scattered maps) ----

export function getCharacterEmoji(name: string): string {
  return PACKS.get(name)?.emoji ?? '?';
}

export function hasCustomEyes(name: string): boolean {
  return PACKS.get(name)?.customEyes ?? false;
}

export function getCharacterSplatShape(name: string): SplatShape {
  return PACKS.get(name)?.splatShape ?? 'circle';
}

export function getCharacterGibs(name: string): GibDef[] | undefined {
  return PACKS.get(name)?.gibs;
}

/** Get a character's display name for the given language, falling back to the English name. */
export function getCharacterDisplayName(name: string, lang: string): string {
  const pack = PACKS.get(name);
  if (!pack) return name;
  return pack.translations?.[lang] ?? pack.translations?.en ?? name;
}

// ---- Renderer dispatch ----

export function getSpriteRenderer(name: string): CharacterRenderer {
  return PACKS.get(name)?.drawSprite ?? fallbackSpriteRenderer;
}

export function getGibRenderer(name: string): GibRenderer {
  return PACKS.get(name)?.drawGib ?? fallbackGibRenderer;
}

// ---- CharacterDef generation (replaces ALL_CHARACTERS) ----

/** Build a CharacterDef array from all registered packs.
 *  Slot is set to 'P1' (reassigned at lobby time). */
export function getAllCharacterDefs(): CharacterDef[] {
  return Array.from(PACKS.values()).map(pack => ({
    slot: 'P1' as const,
    name: pack.name,
    color: pack.color,
    darkColor: pack.darkColor,
    lightColor: pack.lightColor,
  }));
}
