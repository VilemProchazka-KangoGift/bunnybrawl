import { describe, it, expect } from 'vitest';
import { darken, hexToRGB } from '../fastMath';

describe('darken', () => {
  it('factor 1 returns the input channels in rgb() form (no change)', () => {
    expect(darken('#ff0000', 1)).toBe('rgb(255, 0, 0)');
    expect(darken('#00ff00', 1)).toBe('rgb(0, 255, 0)');
    expect(darken('#0000ff', 1)).toBe('rgb(0, 0, 255)');
  });

  it('factor 0 returns black regardless of input', () => {
    expect(darken('#ff0000', 0)).toBe('rgb(0, 0, 0)');
    expect(darken('#ffffff', 0)).toBe('rgb(0, 0, 0)');
    expect(darken('#abcdef', 0)).toBe('rgb(0, 0, 0)');
  });

  it('factor 0.5 produces approximately half-brightness', () => {
    // 255 * 0.5 = 127.5 → rounded to 128
    expect(darken('#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    // black stays black
    expect(darken('#000000', 0.5)).toBe('rgb(0, 0, 0)');
    // 0xff = 255 → 128 ; 0x80 = 128 → 64
    expect(darken('#ff8000', 0.5)).toBe('rgb(128, 64, 0)');
  });

  it('factor 0.8 (the OUTLINE_DARKEN reference value) shrinks each channel by 20%', () => {
    // 255 * 0.8 = 204
    expect(darken('#ffffff', 0.8)).toBe('rgb(204, 204, 204)');
  });

  it('uppercase hex input is accepted (parseInt case-insensitive)', () => {
    // hexToRGB delegates to parseInt(_, 16) which accepts both cases.
    expect(darken('#FF0000', 0.5)).toBe('rgb(128, 0, 0)');
    expect(darken('#AbCdEf', 1)).toEqual(darken('#abcdef', 1));
  });

  it('hexToRGB sanity (used by darken)', () => {
    expect(hexToRGB('#ff8040')).toEqual({ r: 255, g: 128, b: 64 });
  });
});
