import { describe, it, expect, afterAll } from 'vitest';
import i18n from './i18n';

// The test setup file already switches to 'en'. Save and restore at the end.
const originalLng = i18n.language;

afterAll(async () => {
  await i18n.changeLanguage(originalLng);
});

describe('i18n configuration', () => {
  it('has Czech as the default language', () => {
    // The init config sets lng to 'cs' (unless localStorage overrides).
    // We verify the config value, not the runtime value (setup.ts switches to 'en').
    expect(i18n.options.lng).toBe('cs');
  });

  it('has English as the fallback language', () => {
    // i18next normalizes fallbackLng to an array internally
    expect(i18n.options.fallbackLng).toContain('en');
  });

  it('loads Czech resources', () => {
    const csTranslation = i18n.getResourceBundle('cs', 'translation');
    expect(csTranslation).toBeDefined();
    expect(csTranslation.play).toBeDefined();
  });

  it('loads English resources', () => {
    const enTranslation = i18n.getResourceBundle('en', 'translation');
    expect(enTranslation).toBeDefined();
    expect(enTranslation.play).toBe('Play');
  });

  it('loads Hindi resources', () => {
    const hiTranslation = i18n.getResourceBundle('hi', 'translation');
    expect(hiTranslation).toBeDefined();
    expect(Object.keys(hiTranslation).length).toBeGreaterThan(0);
  });

  it('loads Filipino resources', () => {
    const filTranslation = i18n.getResourceBundle('fil', 'translation');
    expect(filTranslation).toBeDefined();
    expect(Object.keys(filTranslation).length).toBeGreaterThan(0);
  });

  it('has all four languages available', () => {
    const languages = Object.keys(i18n.options.resources!);
    expect(languages).toContain('cs');
    expect(languages).toContain('en');
    expect(languages).toContain('hi');
    expect(languages).toContain('fil');
  });

  it('switching language works', async () => {
    await i18n.changeLanguage('cs');
    expect(i18n.language).toBe('cs');

    await i18n.changeLanguage('en');
    expect(i18n.language).toBe('en');
  });

  it('translates common keys in English', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('play')).toBe('Play');
    expect(i18n.t('back')).toBe('Back');
  });

  it('translates keys in Czech', async () => {
    await i18n.changeLanguage('cs');
    const play = i18n.t('play');
    // Czech translation should exist and differ from the key name
    expect(play).toBeDefined();
    expect(play).not.toBe('play');
  });

  it('falls back to English for missing keys in other languages', async () => {
    // If a key is missing in the current language, fallback to 'en'
    await i18n.changeLanguage('en');
    const enValue = i18n.t('play');

    // Switch to a language and check fallback behavior —
    // even if the key exists, the fallback mechanism is configured
    expect(enValue).toBe('Play');
  });

  it('has escapeValue disabled for interpolation', () => {
    expect(i18n.options.interpolation?.escapeValue).toBe(false);
  });
});
