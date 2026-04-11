import { describe, it, expect } from 'vitest';
import en from './en.json';
import cs from './cs.json';
import hi from './hi.json';
import fil from './fil.json';

/** Recursively collect all keys from a flat JSON object. */
function getKeys(obj: Record<string, string>): string[] {
  return Object.keys(obj).sort();
}

describe('Locale Files Validation', () => {
  const enKeys = getKeys(en);
  const csKeys = getKeys(cs);
  const hiKeys = getKeys(hi);
  const filKeys = getKeys(fil);

  // --- English vs Czech ---

  describe('English and Czech parity', () => {
    it('English and Czech share the same base keys', () => {
      // Czech may have extra plural forms (_few, extra _one/_other) which
      // English doesn't need (i18next plural rules differ per language).
      // We only check that English has no keys missing from Czech.
      const enOnlyKeys = enKeys.filter(k => !csKeys.includes(k));
      expect(enOnlyKeys, `Keys in English but not Czech: ${enOnlyKeys.join(', ')}`).toEqual([]);
    });

    it('every English key exists in Czech', () => {
      const missing = enKeys.filter(k => !csKeys.includes(k));
      expect(missing, `Keys in English but not Czech: ${missing.join(', ')}`).toEqual([]);
    });

    it('every Czech key exists in English (ignoring i18next plural suffixes)', () => {
      // Czech has _few plural forms and extra _one/_other variants that
      // English doesn't need (i18next plural rules differ per language).
      // A Czech-only key is acceptable if stripping the plural suffix
      // yields a base key that exists in English.
      const pluralSuffixes = /_(zero|one|two|few|many|other)$/;
      const csNonPlural = csKeys.filter(k => {
        if (!enKeys.includes(k) && pluralSuffixes.test(k)) {
          const base = k.replace(pluralSuffixes, '');
          if (enKeys.includes(base) || enKeys.includes(base + '_one') || enKeys.includes(base + '_other')) {
            return false; // acceptable plural variant
          }
        }
        return true;
      });
      const missing = csNonPlural.filter(k => !enKeys.includes(k));
      expect(missing, `Keys in Czech but not English: ${missing.join(', ')}`).toEqual([]);
    });
  });

  // --- No empty values ---

  describe('no empty string values', () => {
    it('no empty string values in English', () => {
      const empty = enKeys.filter(k => (en as Record<string, string>)[k] === '');
      expect(empty, `Empty values in English: ${empty.join(', ')}`).toEqual([]);
    });

    it('no empty string values in Czech', () => {
      const empty = csKeys.filter(k => (cs as Record<string, string>)[k] === '');
      expect(empty, `Empty values in Czech: ${empty.join(', ')}`).toEqual([]);
    });
  });

  // --- Common keys have values ---

  describe('common keys have non-empty values', () => {
    const commonKeys = ['play', 'back', 'settings', 'start_game'] as const;

    // 'settings' may not exist in this project, so filter to keys that exist
    const existingCommonKeys = commonKeys.filter(k => enKeys.includes(k));

    it.each(existingCommonKeys)('"%s" has non-empty value in English', (key) => {
      expect((en as Record<string, string>)[key]?.length).toBeGreaterThan(0);
    });

    it.each(existingCommonKeys)('"%s" has non-empty value in Czech', (key) => {
      expect((cs as Record<string, string>)[key]?.length).toBeGreaterThan(0);
    });
  });

  // --- Hindi locale ---

  describe('Hindi locale', () => {
    it('Hindi file exists and is not empty', () => {
      expect(Object.keys(hi).length).toBeGreaterThan(0);
    });

    it('Hindi has same keys as English', () => {
      const missing = enKeys.filter(k => !hiKeys.includes(k));
      expect(missing, `Keys in English but not Hindi: ${missing.join(', ')}`).toEqual([]);
    });

    it('Hindi has no extra keys beyond English', () => {
      const extra = hiKeys.filter(k => !enKeys.includes(k));
      expect(extra, `Extra keys in Hindi: ${extra.join(', ')}`).toEqual([]);
    });
  });

  // --- Filipino locale ---

  describe('Filipino locale', () => {
    it('Filipino file exists and is not empty', () => {
      expect(Object.keys(fil).length).toBeGreaterThan(0);
    });

    it('Filipino has same keys as English', () => {
      const missing = enKeys.filter(k => !filKeys.includes(k));
      expect(missing, `Keys in English but not Filipino: ${missing.join(', ')}`).toEqual([]);
    });

    it('Filipino has no extra keys beyond English', () => {
      const extra = filKeys.filter(k => !enKeys.includes(k));
      expect(extra, `Extra keys in Filipino: ${extra.join(', ')}`).toEqual([]);
    });
  });
});
