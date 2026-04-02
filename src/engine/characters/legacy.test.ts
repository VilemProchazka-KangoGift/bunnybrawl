import { describe, it, expect } from 'vitest';
import { CHARACTERS, getCharacter } from './legacy';

describe('Characters', () => {
  it('has all four characters defined', () => {
    expect(CHARACTERS.P1).toBeDefined();
    expect(CHARACTERS.P2).toBeDefined();
    expect(CHARACTERS.P3).toBeDefined();
    expect(CHARACTERS.P4).toBeDefined();
  });

  it('P1 is Bunny (white)', () => {
    expect(CHARACTERS.P1.name).toBe('Bunny');
    expect(CHARACTERS.P1.color).toBe('#FFFFFF');
  });

  it('P2 is Fox (orange)', () => {
    expect(CHARACTERS.P2.name).toBe('Fox');
    expect(CHARACTERS.P2.color).toBe('#FF8C00');
  });

  it('P3 is Frog (green)', () => {
    expect(CHARACTERS.P3.name).toBe('Frog');
    expect(CHARACTERS.P3.color).toBe('#32CD32');
  });

  it('P4 is Bear (brown)', () => {
    expect(CHARACTERS.P4.name).toBe('Bear');
    expect(CHARACTERS.P4.color).toBe('#8B4513');
  });

  it('each character has dark and light colors', () => {
    for (const char of Object.values(CHARACTERS)) {
      expect(char.darkColor).toBeDefined();
      expect(char.lightColor).toBeDefined();
      expect(char.darkColor).not.toBe(char.lightColor);
    }
  });

  it('getCharacter returns correct character', () => {
    expect(getCharacter('P3')).toBe(CHARACTERS.P3);
  });
});
